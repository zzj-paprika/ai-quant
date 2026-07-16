const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('task03/dual_ma_dashboard.html', 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];

class Stub {
  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.dataset = {};
    this.style = {};
    this.innerHTML = '';
    this.textContent = '';
    this.className = '';
    this.classList = { add() {}, remove() {} };
    this.parentElement = { querySelector: () => new Stub('tooltip') };
  }
  addEventListener() {}
  appendChild() {}
  querySelector() { return new Stub(); }
  getBoundingClientRect() { return { width: 720, height: 320, left: 0, top: 0 }; }
  getContext() {
    return {
      setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
      fillText() {}, fillRect() {}, closePath() {}, setLineDash() {}, arc() {}, save() {}, restore() {},
      measureText(text) { return { width: String(text).length * 7 }; },
    };
  }
}

const ids = [
  'stock','fast','slow','start','end','fee','rsi-on','rsi-period','rsi-max','tp-on','tp','sl-on','sl',
  'reverse-on','capital','full-range','reset','zoom-reset','trade-filter','title-stock','data-chip','adj-chip',
  'fast-legend','slow-legend','entry-rule','exit-rule','fee-rule','rule-warning','error','price-sub','signal-summary',
  'equity-summary','dd-chip','dd-sub','month-chip','compare-sub','price-chart','equity-chart','drawdown-chart',
  'monthly-chart','sharpe-chart','trades','open-position','zoom-label'
  ,'zoom-slider-row','time-slider','slider-range'
];
const elements = Object.fromEntries(ids.map(id => [id, new Stub(id)]));
Object.assign(elements.fast, { value: '5' });
Object.assign(elements.slow, { value: '20' });
Object.assign(elements['rsi-period'], { value: '14' });
Object.assign(elements['rsi-max'], { value: '70' });
Object.assign(elements.tp, { value: '10' });
Object.assign(elements.sl, { value: '5' });
Object.assign(elements.capital, { value: '100000' });
Object.assign(elements['trade-filter'], { value: 'all' });
for (const id of ['fee','rsi-on','tp-on','sl-on','reverse-on']) elements[id].checked = true;

const inputIds = ['stock','fast','slow','start','end','fee','rsi-on','rsi-period','rsi-max','tp-on','tp','sl-on','sl','reverse-on','capital'];
const presets = [['5','20'],['10','30'],['20','60']].map(([fast,slow]) => { const el = new Stub(); el.dataset = { fast, slow }; return el; });
const metricCard = { classList: { add() {}, remove() {} }, querySelector: () => new Stub() };
const documentStub = {
  documentElement: new Stub('documentElement'),
  getElementById(id) { return elements[id] || (elements[id] = new Stub(id)); },
  createElement() { return new Stub(); },
  querySelector() { return metricCard; },
  querySelectorAll(selector) {
    if (selector === 'input,select') return inputIds.map(id => elements[id]);
    if (selector === '.preset') return presets;
    if (selector === '.info') return [];
    return [];
  },
};

const context = {
  console, setTimeout, clearTimeout, Math, Date, Number, Array, Map, Infinity,
  document: documentStub,
  window: { addEventListener() {} },
  devicePixelRatio: 1,
  alert() {},
  getComputedStyle() { return { getPropertyValue() { return '#ffffff'; } }; },
};
vm.createContext(context);
vm.runInContext(source, context, { filename: 'dual_ma_dashboard.html' });
if (!elements.stock.value) throw new Error('Stock selector was not initialized');
if (!elements['data-chip'].textContent.includes('日')) throw new Error('Initial render did not finish');
console.log('Runtime smoke passed:', elements.stock.value, elements['data-chip'].textContent);
