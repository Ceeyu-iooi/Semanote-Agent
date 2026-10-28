"""Run explicitly authorized local sample sets; keep texts and results in ignored profile."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from semanote_agent import AnnotationAgent
from semanote_agent.config import ProviderConfig
from semanote_agent.providers import ChatCompletionsProvider
from semanote_agent.agent import verifyRetryBaseline


def evaluate(samplesPath, outputRoot, start, end):
    """No implicit retries; each round stores exact input, output and observable checks."""
    root = Path(__file__).resolve().parent.parent
    samplesPath, outputRoot = Path(samplesPath).resolve(), Path(outputRoot).resolve()
    if not samplesPath.is_relative_to(root / 'profile') or not outputRoot.is_relative_to(root / 'profile'):
        raise ValueError('Restricted evaluation evidence must stay inside profile')
    outputRoot.mkdir(parents=True, exist_ok=True)
    samples = json.loads(samplesPath.read_text(encoding='utf-8'))
    class RecordingProvider(ChatCompletionsProvider):
        def generate(self, taskType, text, tokens=None):
            reply = super().generate(taskType, text, tokens)
            (outputRoot / f'candidate-{index+1}-{taskType}.json').write_text(json.dumps(reply.payload,ensure_ascii=False,indent=2),encoding='utf-8')
            return reply
    provider = RecordingProvider(ProviderConfig.fromEnvironment('deepseek', root / '.env'))
    for index in range(start - 1, min(end, len(samples))):
        target = outputRoot / f'round-{index+1}.json'
        if target.exists(): raise ValueError('Round already exists; do not silently overwrite evidence')
        sample = samples[index]
        request = {'requestId': f'corpus-round-{index+1}', 'revisionId': f'sample-{index+1}',
                   'text': sample['text'], 'tasks': ['segmentation', 'keywords', 'pos', 'ner']}
        began = time.monotonic()
        events = []
        def progress(task, state):
            events.append({'task':task, 'state':state, 'elapsed':round(time.monotonic()-began,2)})
            print(f'Round {index+1}: {task} {state}', flush=True)
        response = AnnotationAgent(provider, onProgress=progress).annotate(request)
        verifyRetryBaseline(request, response)
        layers = response['layers']
        covered = {position for item in (layers['segmentation']['result'] or {}).get('items',[]) for span in item['spans'] for position in range(span['start'],span['end'])}
        expected = {position for position,character in enumerate(sample['text']) if not character.isspace()}
        receipt = {'round':index+1,'source':{key:value for key,value in sample.items() if key!='text'},
                   'recordedAt':datetime.now(timezone.utc).isoformat(),'elapsedSeconds':round(time.monotonic()-began,2),
                   'request':request,'response':response,'progress':events,
                   'checks':{'contractValid':True,'allFourLayers':response['status']=='success',
                             'nonWhitespaceCoverage':len(covered & expected)/len(expected),
                             'itemCounts':{task:len((layer['result'] or {}).get('items',[])) for task,layer in layers.items()}},
                   'modelCalls':sum(len(layer['attempts']) for layer in layers.values())}
        target.write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
        print(f'Round {index+1}: {response["status"]}; evidence saved',flush=True)


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--samples',required=True)
    parser.add_argument('--output',required=True)
    parser.add_argument('--start',type=int,default=1)
    parser.add_argument('--end',type=int,default=9)
    parser.add_argument('--remote-consent',action='store_true',required=True)
    args=parser.parse_args()
    evaluate(args.samples,args.output,args.start,args.end)
