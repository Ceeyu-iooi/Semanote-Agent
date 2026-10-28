document.querySelectorAll('[data-demo]').forEach(button=>button.addEventListener('click',()=>{document.querySelector('#demoStatus').textContent=button.dataset.demo;}));
document.querySelectorAll('[data-reading]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-reading]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));document.querySelector('#readingStatus').textContent=`当前选择：${button.dataset.reading}`;}));
document.querySelector('#previewSearch').addEventListener('input',event=>{document.querySelector('#searchStatus').textContent=event.target.value?`正在查找：“${event.target.value}”`:'输入内容体验搜索反馈';});
document.querySelectorAll('[data-width]').forEach(button=>button.addEventListener('click',()=>{const width=Number(button.dataset.width);document.querySelectorAll('[data-width]').forEach(item=>item.classList.toggle('selected',item===button));const demo=document.querySelector('#responsiveDemo');demo.style.maxWidth=`${width}px`;demo.classList.toggle('narrow',width<=833);document.querySelector('#responsiveStatus').textContent=`布局示例：${width}px`;}));

document.querySelectorAll('[data-layer]').forEach(button=>button.addEventListener('click',()=>{const enabled=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(enabled));document.querySelector('#annotationDemo').classList.toggle(`has-${button.dataset.layer}`,enabled);}));
document.querySelectorAll('[data-hint]').forEach(word=>{for(const event of ['pointerenter','focus','click'])word.addEventListener(event,()=>{document.querySelector('#annotationHint').textContent=`${word.textContent} · ${word.dataset.hint}`;});});
document.querySelector('#replayDemo').addEventListener('click',()=>{const demo=document.querySelector('#annotationDemo');demo.classList.remove('demo-replay');requestAnimationFrame(()=>requestAnimationFrame(()=>demo.classList.add('demo-replay')));});
document.querySelectorAll('.demo-token').forEach((word,index)=>word.style.setProperty('--delay',`${index*45}ms`));

document.querySelector('#previewSettings').addEventListener('click',()=>document.querySelector('#readingDialog').showModal());
document.querySelector('#demoSize').addEventListener('input',event=>{document.querySelector('#annotationDemo').style.setProperty('--demo-text-size',`${event.target.value}px`);document.querySelector('#demoSizeValue').textContent=`${event.target.value}px`;});
document.querySelector('#reducedMotion').addEventListener('change',event=>{document.documentElement.dataset.motion=event.target.checked?'reduced':'full';});
