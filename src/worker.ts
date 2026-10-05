import { readText, readXlsx } from './input';
self.onmessage = ({data}) => {
  try { self.postMessage({bank:data.kind === 'xlsx' ? readXlsx(data.buffer) : readText(data.text,data.delimiter)}); }
  catch (e) { self.postMessage({error:(e as Error).message}); }
};
