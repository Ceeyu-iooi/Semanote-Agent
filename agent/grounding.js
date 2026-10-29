import { positions,requireValue } from './contract.js';

/** Only model-added punctuation can be discarded. Every original nonspace character still must match. */
export function groundTokens(tuples,text){
 requireValue(Array.isArray(tuples),'missingTokens');const chars=Array.from(text),result=[];let cursor=0;
 const whitespace=()=>{while(cursor<chars.length&&/\s/u.test(chars[cursor]))cursor++;};
 for(const tuple of tuples){requireValue(Array.isArray(tuple)&&typeof tuple[0]==='string'&&tuple[0]&&!/\s/u.test(tuple[0]),'invalidToken');
  for(const piece of tuple[0].match(/[^\p{P}]+|\p{P}/gu)||[]){whitespace();
   if(/^\p{P}$/u.test(piece)){if(chars[cursor]===piece){result.push([piece,'PUNCT']);cursor++;}continue;}
   while(cursor<chars.length&&/^\p{P}$/u.test(chars[cursor])){result.push([chars[cursor++],'PUNCT']);whitespace();}
   const end=cursor+Array.from(piece).length;requireValue(chars.slice(cursor,end).join('')===piece,'tokenMismatch','分词词面或顺序与原文不符。');result.push([piece,tuple[1]]);cursor=end;
  }
 }
 whitespace();while(cursor<chars.length&&/^\p{P}$/u.test(chars[cursor])){result.push([chars[cursor++],'PUNCT']);whitespace();}
 requireValue(cursor===chars.length,'incompleteTokens');return result;
}
/** Ordered tasks choose exact occurrences by their source order, never by model-generated offsets. */
export function groundOrdered(raw,text){let cursor=0;return raw.map(item=>{const starts=positions(text,item.itemText);const occurrence=starts.findIndex(start=>start>=cursor);requireValue(occurrence>=0,'orderedSourceMismatch');cursor=starts[occurrence]+Array.from(item.itemText).length;return {...item,occurrence};});}
/** Contextual evidence is expanded to its original sentence, without synthesizing or changing any text. */
export function sentenceEvidence(raw,text){
 const chars=Array.from(text);return raw.map(item=>{
  const starts=positions(text,item.itemText),occurrence=item.occurrence??0;requireValue(Number.isInteger(occurrence)&&occurrence>=0&&occurrence<starts.length,'invalidOccurrence');
  let start=starts[occurrence],end=start+Array.from(item.itemText).length;
  while(start>0&&!/[。！？!?\n\r]/u.test(chars[start-1]))start--;
  while(end<chars.length&&!/[。！？!?\n\r]/u.test(chars[end-1]))end++;
  while(end<chars.length&&/[”’」』]/u.test(chars[end]))end++;
  const itemText=chars.slice(start,end).join('');return {...item,itemText,occurrence:positions(text,itemText).indexOf(start)};
 });
}
