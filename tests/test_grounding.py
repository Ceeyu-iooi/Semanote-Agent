"""Regression for concrete corpus failures, using original synthetic fixtures only."""
import unittest
from semanote_agent.grounding import groundPayload, completeFormattedEntities
from semanote_agent.annotations import convertItems
from semanote_agent.errors import AnnotationError

class GroundingTests(unittest.TestCase):
    def testDecimalPunctuationIsSplitWithoutChangingSource(self):
        result=groundPayload('segmentation',{'items':[{'itemText':'金额'},{'itemText':'10.5'},{'itemText':'元。'}]},'金额10.5元。')
        self.assertEqual([item['itemText'] for item in convertItems('segmentation',result,'金额10.5元。')],['金额','10','.','5','元','。'])
    def testCompleteSingleLabelGroupCanBeGrounded(self):
        result=groundPayload('ner',{'items':[{'itemText':'明天','label':'TIME','occurrence':0},{'itemText':'明天','label':'TIME','occurrence':2}]},'明天见，明天出发。')
        self.assertEqual([item['occurrence'] for item in result['items']],[0,1])
    def testPartialOrAmbiguousGroupsStillFail(self):
        payload={'items':[{'itemText':'明天','label':'TIME','occurrence':5}]}
        with self.assertRaises(AnnotationError):convertItems('ner',groundPayload('ner',payload,'明天见，明天出发。'),'明天见，明天出发。')
    def testChangedSourceIsNeverRepairedByGuessing(self):
        with self.assertRaises(AnnotationError):convertItems('segmentation',groundPayload('segmentation',{'items':[{'itemText':'进入'}]},'走进'),'走进')
    def testMentionDictionaryGroundsEveryExactOccurrence(self):
        output=groundPayload('ner',{'items':[{'itemText':'小林','label':'PERSON'}]},'小林与小林会面。')
        self.assertEqual([item['occurrence'] for item in output['items']],[0,1])
        self.assertEqual(len(convertItems('ner',output,'小林与小林会面。')),2)
    def testSourceProjectionOnlyRetainsSameLengthWordBoundaries(self):
        text='文字'*100+'出发。'
        output=groundPayload('segmentation',{'items':[{'itemText':'文字'}]*100+[{'itemText':'出友。'}]},text)
        self.assertEqual(''.join(item['itemText'] for item in convertItems('segmentation',output,text)),text)
    def testFormattedEntitiesFillMissingAmountsAndPreferCompleteDate(self):
        text='在2026年4月12日支付3万元和柒万元整，利率2%。'
        result=completeFormattedEntities(convertItems('ner',{'items':[{'itemText':'4月12日','label':'TIME','occurrence':0}]},text),text)
        self.assertEqual([(item['itemText'],item['label']) for item in result],[('2026年4月12日','TIME'),('3万元','MONEY'),('柒万元整','MONEY')])

if __name__=='__main__':unittest.main()
