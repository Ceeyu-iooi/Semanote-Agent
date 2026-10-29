"""Convert model selections to verified code-point spans without trusting offsets."""

import unicodedata
import uuid

from .errors import ValidationError
from .rules import entityLabels, posLabels


def newIdentity():
    """Create a new attempt, result or item identity; never reuse a model ID."""
    return str(uuid.uuid4())


def exactPositions(text, itemText):
    """Enumerate every exact match, including overlapping occurrences."""
    positions = []
    nextStart = 0
    while itemText and (startOffset := text.find(itemText, nextStart)) >= 0:
        positions.append(startOffset)
        nextStart = startOffset + 1
    return positions


def makeSpan(text, startOffset, endOffset):
    """Build a checked half-open Unicode code-point range."""
    if not (0 <= startOffset < endOffset <= len(text)):
        raise ValidationError("invalidSpan", "标注区间不合法。")
    return {"start": startOffset, "end": endOffset, "surfaceText": text[startOffset:endOffset]}


def readItems(payload):
    """Reject absent/extra envelope fields rather than treating malformed JSON as empty."""
    if (not isinstance(payload, dict) or set(payload) != {"items"}
            or not isinstance(payload["items"], list)):
        raise ValidationError("invalidItems", "模型必须返回只包含 items 列表的对象。")
    return payload["items"]


def requireFields(item, fieldNames):
    """Reject malformed items and unrequested model-generated fields."""
    if not isinstance(item, dict) or set(item) != set(fieldNames):
        raise ValidationError("invalidItem", "标注条目字段不符合该任务契约。")


def readItemText(item):
    """Require an exact, meaningful source fragment without trimming it."""
    itemText = item["itemText"]
    if not isinstance(itemText, str) or not itemText or itemText.isspace():
        raise ValidationError("invalidItemText", "条目词面必须为非空白字符串。")
    return itemText


def convertSegmentation(payload, text):
    """Walk forward over the original text, permitting only whitespace gaps."""
    convertedItems = []
    cursor = 0
    for rawItem in readItems(payload):
        requireFields(rawItem, ("itemText",))
        itemText = readItemText(rawItem)
        if any(character.isspace() for character in itemText):
            raise ValidationError("invalidToken", "分词条目不能包含原文空白。")
        if len(itemText) > 1 and any(unicodedata.category(character).startswith("P") for character in itemText):
            raise ValidationError("invalidPunctuation", "标点必须逐个成为独立词项。")
        while cursor < len(text) and text[cursor].isspace():
            cursor += 1
        if not text.startswith(itemText, cursor):
            raise ValidationError("tokenMismatch", "分词词面、顺序或覆盖范围与原文不符。")
        endOffset = cursor + len(itemText)
        convertedItems.append({"itemId": newIdentity(), "itemText": itemText,
                               "spans": [makeSpan(text, cursor, endOffset)]})
        cursor = endOffset
    if any(not character.isspace() for character in text[cursor:]):
        raise ValidationError("incompleteTokens", "分词未覆盖全部非空白字符。")
    return convertedItems


def convertKeywords(payload, text):
    """Map unique extractive keywords to all exact source occurrences."""
    rawItems = readItems(payload)
    if len(rawItems) > 10:
        raise ValidationError("tooManyKeywords", "关键词不能超过10个。")
    convertedItems, seenWords = [], set()
    for rank, rawItem in enumerate(rawItems, 1):
        requireFields(rawItem, ("itemText",))
        itemText = readItemText(rawItem)
        positions = exactPositions(text, itemText)
        if not positions or itemText in seenWords:
            raise ValidationError("invalidKeyword", "关键词必须唯一且逐字符出现在原文中。")
        seenWords.add(itemText)
        convertedItems.append({"itemId": newIdentity(), "itemText": itemText, "rank": rank,
                               "spans": [makeSpan(text, position, position + len(itemText)) for position in positions]})
    return convertedItems


def convertPos(payload, tokens):
    """Bind each POS to an existing token rather than accepting new token boundaries."""
    rawItems = readItems(payload)
    if len(rawItems) != len(tokens):
        raise ValidationError("posCountMismatch", "词性条目必须覆盖每个分词词项。")
    convertedItems = []
    for index, (rawItem, token) in enumerate(zip(rawItems, tokens)):
        requireFields(rawItem, ("tokenIndex", "label"))
        if type(rawItem["tokenIndex"]) is not int or rawItem["tokenIndex"] != index:
            raise ValidationError("invalidTokenReference", "词性索引必须与分词词序逐项一致。")
        if not isinstance(rawItem["label"], str) or rawItem["label"] not in posLabels:
            raise ValidationError("invalidPosLabel", "词性标签不属于冻结的 UD 17 类集合。")
        convertedItems.append({"itemId": newIdentity(), "itemText": token["itemText"],
                               "tokenItemId": token["itemId"], "label": rawItem["label"],
                               "spans": [dict(span) for span in token["spans"]]})
    return convertedItems


def convertNer(payload, text):
    """Resolve explicit occurrence ordinals; preserve nested and repeated entities."""
    convertedItems, seenEntities, positionCache = [], set(), {}
    for rawItem in readItems(payload):
        requireFields(rawItem, ("itemText", "label", "occurrence"))
        itemText = readItemText(rawItem)
        label, occurrence = rawItem["label"], rawItem["occurrence"]
        if not isinstance(label, str) or label not in entityLabels:
            raise ValidationError("invalidEntityLabel", "实体标签不属于冻结的五类集合。")
        if itemText not in positionCache:
            positionCache[itemText] = exactPositions(text, itemText)
        positions = positionCache[itemText]
        if type(occurrence) is not int or not 0 <= occurrence < len(positions):
            raise ValidationError("invalidOccurrence", "实体出现序号不存在或类型不合法。")
        startOffset = positions[occurrence]
        endOffset = startOffset + len(itemText)
        entityKey = (startOffset, endOffset, label)
        if entityKey in seenEntities:
            raise ValidationError("duplicateEntity", "同一区间和标签的实体不能重复。")
        seenEntities.add(entityKey)
        convertedItems.append({"itemId": newIdentity(), "itemText": itemText, "label": label,
                               "spans": [makeSpan(text, startOffset, endOffset)]})
    return sorted(convertedItems, key=lambda item: (item["spans"][0]["start"], item["spans"][0]["end"], item["label"]))


def convertItems(taskType, payload, text, tokens=None):
    """Dispatch a candidate through the task-specific semantic validator."""
    if taskType == "segmentation":
        return convertSegmentation(payload, text)
    if taskType == "keywords":
        return convertKeywords(payload, text)
    if taskType == "pos":
        return convertPos(payload, tokens or [])
    return convertNer(payload, text)
