import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDisplayLayers } from '../src/annotationPresentation.js';

test('new pending inference never reports saved layers as returned progress',()=>{
  const saved={layers:{ner:{status:'success'},pos:{status:'success'}}};
  assert.deepEqual(resolveDisplayLayers(null,{state:'queued',response:null,progress:null},saved),{});
  const partial={segmentation:{status:'success'}};
  assert.deepEqual(resolveDisplayLayers(null,{state:'running',progress:{layers:partial}},saved),partial);
});
test('historical empty layers remain distinct from a candidate and current results',()=>{
  assert.deepEqual(resolveDisplayLayers({layers:{}},{response:{layers:{ner:{status:'success'}}}},{layers:{pos:{status:'success'}}}),{});
});
