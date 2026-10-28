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
export const taskNames = { segmentation: '分词', keywords: '关键词', pos: '词性', ner: '命名实体' };
export const entityNames = { PERSON: '人名', LOCATION: '地名', ORGANIZATION: '机构', TIME: '时间', MONEY: '金额' };
export const stateNames = { queued: '排队中', running: '标注中', success: '已完成', partialFailure: '部分失败', failed: '失败', interrupted: '已中断', notRequested: '未执行' };
