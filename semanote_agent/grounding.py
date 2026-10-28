"""Deterministic source grounding; never invent text or guess an ambiguous entity occurrence."""
from collections import defaultdict
import copy
import unicodedata
import re
from difflib import SequenceMatcher
from .annotations import exactPositions, readItems
from .annotations import newIdentity, makeSpan


def groundPayload(taskType, payload, text):
    """Split punctuation without changing characters; resolve only complete unambiguous entity groups."""
    if taskType not in ('segmentation','ner'):
        return payload
    output=copy.deepcopy(payload)
    items=readItems(output)
    if taskType=='segmentation':
        # Token boundaries are model suggestions; source characters remain authoritative.
        # Project only same-length substitutions with >=99% exact agreement, never insertions/deletions.
        if all(isinstance(item,dict) and set(item)=={'itemText'} and isinstance(item['itemText'],str) and item['itemText'] and not any(c.isspace() for c in item['itemText']) for item in items):
            source=''.join(character for character in text if not character.isspace())
            proposed=''.join(item['itemText'] for item in items)
            if len(source)==len(proposed) and source!=proposed:
                operations=SequenceMatcher(None,proposed,source,autojunk=False).get_opcodes()
                different=sum(a!=b for a,b in zip(source,proposed))
                if different/len(source)<=0.01 and all(kind=='equal' or (kind=='replace' and end-start==sourceEnd-sourceStart) for kind,start,end,sourceStart,sourceEnd in operations):
                    cursor=0
                    for item in items:
                        length=len(item['itemText']);item['itemText']=source[cursor:cursor+length];cursor+=length
        expanded=[]
        for item in items:
            if not isinstance(item,dict) or set(item)!={'itemText'} or not isinstance(item['itemText'],str):
                expanded.append(item);continue
            word=item['itemText'];chunk=''
            for character in word:
                if unicodedata.category(character).startswith('P'):
                    if chunk:expanded.append({'itemText':chunk});chunk=''
                    expanded.append({'itemText':character})
                else:chunk+=character
            if chunk:expanded.append({'itemText':chunk})
        output['items']=expanded
    else:
        mentions=[]
        for item in items:
            if isinstance(item,dict) and set(item)=={'itemText','label'} and isinstance(item['itemText'],str) and isinstance(item['label'],str):
                positions=exactPositions(text,item['itemText'])
                if positions:mentions.extend({**item,'occurrence':index} for index in range(len(positions)))
                else:mentions.append(item)  # Preserve invalid data for the strict validator to reject.
            else:mentions.append(item)
        output['items']=items=mentions
        groups=defaultdict(list)
        for item in items:
            if isinstance(item,dict) and set(item)=={'itemText','label','occurrence'} and isinstance(item['itemText'],str) and isinstance(item['label'],str):
                groups[item['itemText']].append(item)
        for word,group in groups.items():
            count=len(exactPositions(text,word));ordinals=[item['occurrence'] for item in group]
            if count and len(group)==count and len({item['label'] for item in group})==1 and all(type(value) is int and value>=0 for value in ordinals) and len(set(ordinals))==count and any(value>=count for value in ordinals):
                for ordinal,item in enumerate(sorted(group,key=lambda item:item['occurrence'])):item['occurrence']=ordinal
    return output


def completeFormattedEntities(items, text):
    """Add explicit Chinese calendar/currency forms; retain model-only names and other time expressions."""
    candidates=list(items)
    patterns={
        'TIME':r'(?<!\d)(?:\d{4}年)?(?:1[0-2]|0?[1-9])月(?:3[01]|[12]\d|0?[1-9])[日号]',
        'MONEY':r'(?:[￥¥]|人民币)?(?:\d+(?:[.,]\d+)*|[零〇一二三四五六七八九十百千万亿壹贰叁肆伍陆柒捌玖拾佰仟]+)(?:万|亿)?(?:人民币|美元|欧元|港元|日元|元)(?:整)?',
    }
    seen={(item['spans'][0]['start'],item['spans'][0]['end'],item['label']) for item in candidates}
    for label,pattern in patterns.items():
        for match in re.finditer(pattern,text):
            key=(match.start(),match.end(),label)
            if key not in seen:
                candidates.append({'itemId':newIdentity(),'itemText':match.group(),'label':label,'spans':[makeSpan(text,match.start(),match.end())]});seen.add(key)
    # For formatted dates and amounts use the maximal mention at each location; preserve other nested entity types.
    output=[]
    for item in candidates:
        span=item['spans'][0]
        if item['label'] in patterns and any(other['label']==item['label'] and other['spans'][0]['start']<=span['start'] and other['spans'][0]['end']>=span['end'] and (other['spans'][0]['end']-other['spans'][0]['start'])>(span['end']-span['start']) for other in candidates):continue
        output.append(item)
    return sorted(output,key=lambda item:(item['spans'][0]['start'],item['spans'][0]['end'],item['label']))
