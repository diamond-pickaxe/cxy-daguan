(()=>{
 let revision=null,tail=Promise.resolve(),failed=null;
 window.Yu408Store={
  async load(fallback){const response=await fetch('/api/408/progress');if(!response.ok)throw Error('无法读取本机学习记录，请刷新后重试。');revision=response.headers.get('etag');if(!revision)throw Error('记录版本缺失，请刷新页面。');return await response.json()||fallback;},
  save(value){const body=JSON.stringify(value);const task=tail.then(async()=>{if(failed)throw failed;const response=await fetch('/api/408/progress',{method:'PUT',headers:{'Content-Type':'application/json','If-Match':revision},body});if(!response.ok)throw Error(response.status===409?'其他窗口已更新记录，请先导出备份，再刷新页面。':'保存失败，请先导出备份。');revision=response.headers.get('etag');});tail=task.catch(error=>{failed=error;});return task;},
  idle(){return tail.then(()=>{if(failed)throw failed;});}
 };
 window.addEventListener('beforeunload',event=>{if(failed){event.preventDefault();event.returnValue='';}});
})();
