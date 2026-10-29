export async function request(path, options = {}) {
  const headers = options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' };
  const response = await fetch(`/api/v1${path}`, { ...options, headers: { ...headers, ...options.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error?.message || '服务暂不可用，请重试。');
    error.code = payload.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload;
}
export const send = (path, body, method = 'POST') => request(path, { method, body: JSON.stringify(body) });
export const taskNames = { segmentation: '分词', keywords: '关键词', pos: '词性', ner: '命名实体', paragraphs:'原文分段',relations:'关系',events:'事件',sentiment:'情感',intent:'意图',semantic:'语义',errors:'错误' };
export const labelNames={POSITIVE:'正面',NEGATIVE:'负面',NEUTRAL:'中性',INFORM:'陈述',REQUEST:'请求',QUESTION:'提问',COMMAND:'指令',PROMISE:'承诺',OTHER:'其他',TOPIC:'主题',LIST_ITEM:'列举分点',EXPLANATION:'说明',CONCLUSION:'总结',GRAMMAR:'语法',WORD_CHOICE:'用词',TYPO:'错别字',PUNCTUATION:'标点'};
export const entityNames = { PERSON: '人名', LOCATION: '地名', ORGANIZATION: '机构', TIME: '时间', MONEY: '金额' };
export const stateNames = { queued: '排队中', running: '标注中', success: '已完成', partialFailure: '部分失败', failed: '失败', interrupted: '已中断', notRequested: '未执行' };
