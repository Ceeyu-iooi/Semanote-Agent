"""Frozen annotation rules, independent of provider-specific labels or offsets."""

import hashlib

from .errors import InputError

contractVersion = "1.0.0"
specVersion = "1.0.0"
adapterVersion = "1.3.0"
promptVersion = "1.2.0"
taskTypes = ("segmentation", "keywords", "pos", "ner")
posLabels = {
    "ADJ": "形容词", "ADP": "介词", "ADV": "副词", "AUX": "助动词",
    "CCONJ": "并列连词", "DET": "限定词", "INTJ": "感叹词", "NOUN": "普通名词",
    "NUM": "数词", "PART": "助词", "PRON": "代词", "PROPN": "专有名词",
    "PUNCT": "标点", "SCONJ": "从属连词", "SYM": "符号", "VERB": "动词", "X": "其他",
}
entityLabels = {
    "PERSON": "人名", "LOCATION": "地名", "ORGANIZATION": "机构",
    "TIME": "日期与时间", "MONEY": "含币种或货币单位的金额",
}


def textFingerprint(text):
    """Hash the exact UTF-8 text, preserving whitespace and normalization form."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def validateRequest(request):
    """Validate a standalone request and derive visible POS dependencies."""
    if not isinstance(request, dict) or set(request) != {"requestId", "revisionId", "text", "tasks"}:
        raise InputError("invalidRequest", "请求必须只包含 requestId、revisionId、text 和 tasks。")
    for fieldName in ("requestId", "revisionId"):
        if not isinstance(request[fieldName], str) or not request[fieldName].strip():
            raise InputError("invalidIdentity", "请求和修订身份必须是非空字符串。")
    text = request["text"]
    if not isinstance(text, str) or not text.strip():
        raise InputError("emptyText", "标注需要非空且不全为空白的文本。")
    try:
        text.encode("utf-8")
    except UnicodeEncodeError:
        raise InputError("invalidUnicode", "文本包含无法编码为 UTF-8 的孤立代理字符。") from None
    tasks = request["tasks"]
    if (not isinstance(tasks, list) or not tasks
            or any(not isinstance(task, str) or task not in taskTypes for task in tasks)
            or len(tasks) != len(set(tasks))):
        raise InputError("invalidTasks", "任务必须是四类已支持任务组成的非空、无重复列表。")
    requestedTasks = [task for task in taskTypes if task in tasks]
    effectiveTasks = list(requestedTasks)
    if "pos" in requestedTasks and "segmentation" not in effectiveTasks:
        effectiveTasks.insert(0, "segmentation")
    return requestedTasks, effectiveTasks
