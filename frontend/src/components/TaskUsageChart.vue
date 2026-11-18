<script setup>
import { computed, ref } from 'vue';
import PointerTip from './PointerTip.vue';
const props = defineProps({ series: { type: Array, default: () => [] } });
const range = ref(30), tip = ref(null);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dayNumber = value => Math.floor(Date.parse(`${value}T00:00:00Z`) / 86400000);
const endDay = dayNumber(today);
const firstDay = computed(() => range.value ? endDay - range.value + 1 : dayNumber(props.series[0]?.date || today));
const lastDay = computed(() => range.value ? endDay : dayNumber(props.series.at(-1)?.date || today));
const points = computed(() => {
  const byDate = new Map(props.series.map(row => [row.date, row]));
  return Array.from({ length: Math.max(0, lastDay.value - firstDay.value + 1) }, (_, i) => {
    const date = dateLabel(firstDay.value + i), row = byDate.get(date);
    if (!row) return { date, total: 0, rate: 0, remoteCalls: 0, localHits: 0 };
    return { ...row, total: row.promptTokens == null || row.completionTokens == null ? null : row.promptTokens + row.completionTokens, rate: !row.remoteCalls ? 0 : row.promptTokens > 0 && row.cachedTokens != null ? row.cachedTokens / row.promptTokens * 100 : null };
  });
});
const maximum = computed(() => Math.max(1, ...points.value.map(row => row.total ?? 0)));
const x = row => firstDay.value === lastDay.value ? 50 : (dayNumber(row.date) - firstDay.value) * 100 / (lastDay.value - firstDay.value);
const y = (value, max) => 100 - value / max * 100;
function selectRange(value) {
  if (value === range.value) return;
  tip.value = null;
  range.value = value;
}
function segments(key, max) {
  const result = []; let part = [];
  for (const row of points.value) {
    if (row[key] == null) { if (part.length) result.push(part); part = []; continue; }
    part.push({ x: x(row), y: y(row[key], max) });
  }
  if (part.length) result.push(part);
  return result;
}
function line(part) { return part.reduce((path, point, i) => i ? `${path} C ${(part[i-1].x+point.x)/2} ${part[i-1].y}, ${(part[i-1].x+point.x)/2} ${point.y}, ${point.x} ${point.y}` : `M ${point.x} ${point.y}`, ''); }
function area(part) { return `${line(part)} L ${part.at(-1).x} 100 L ${part[0].x} 100 Z`; }
function show(row, event) { const rect = event.currentTarget.getBoundingClientRect(); tip.value = { x: event.clientX || rect.left, y: event.clientY || rect.bottom, row }; }
const dateLabel = day => new Date(day * 86400000).toISOString().slice(0, 10);
</script>
<template>
  <section class="task-usage-chart">
    <div class="panel-heading"><h2>每日模型用量</h2><div class="usage-ranges" role="group" aria-label="日期范围"><button v-for="option in [{value:7,label:'近 7 天'},{value:30,label:'近 30 天'},{value:0,label:'全部'}]" :key="option.value" :class="{selected:range === option.value}" :aria-pressed="range === option.value" @click="selectRange(option.value)">{{ option.label }}</button></div></div>
    <div class="chart-legend"><span>● 总 Token（左轴）</span><span>● 缓存命中率（右轴）</span></div>
    <div v-if="points.length" class="usage-plot daily-plot">
      <svg :key="range" class="usage-series" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="usageTokenGradient" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#40b9a5" stop-opacity=".45"/><stop offset="1" stop-color="#40b9a5" stop-opacity=".02"/></linearGradient><linearGradient id="usageRateGradient" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#7599e9" stop-opacity=".4"/><stop offset="1" stop-color="#7599e9" stop-opacity=".02"/></linearGradient><mask id="usageRateMask"><rect width="100" height="100" fill="white"/><path v-for="(part,i) in segments('total', maximum)" :key="i" :d="area(part)" fill="black"/></mask></defs>
        <path v-for="(part,i) in segments('rate',100)" :key="'rf'+i" :d="area(part)" class="usage-rate-area" mask="url(#usageRateMask)"/><path v-for="(part,i) in segments('total',maximum)" :key="'tf'+i" :d="area(part)" class="usage-token-area"/>
        <path v-for="(part,i) in segments('total',maximum)" :key="'tl'+i" :d="line(part)" class="usage-token-line"/><path v-for="(part,i) in segments('rate',100)" :key="'rl'+i" :d="line(part)" class="usage-rate-line"/>
        <template v-for="row in points" :key="row.date"><circle v-if="row.total != null" :cx="x(row)" :cy="y(row.total,maximum)" r=".4" fill="#159b90"/><circle v-if="row.rate != null" :cx="x(row)" :cy="y(row.rate,100)" r=".4" fill="#6289df"/></template>
      </svg>
      <span class="daily-axis top">{{ maximum.toLocaleString() }} <small>Token</small></span><span class="daily-axis bottom">0</span><span class="daily-axis right">100%</span><span class="daily-axis bottom right-zero">0%</span>
      <button v-for="row in points" :key="row.date" class="usage-point" :style="{left: x(row) + '%', width: `${100 / Math.max(1, points.length - 1)}%`}" :aria-label="`${row.date}，总 Token ${row.total ?? '未知'}，缓存命中率 ${row.rate == null ? '未知' : row.rate.toFixed(1) + '%'}`" @pointermove="show(row, $event)" @focus="show(row, $event)" @pointerleave="tip = null" @blur="tip = null"></button>
    </div>
    <div v-if="points.length" class="usage-axis caption muted"><span>{{ dateLabel(firstDay) }}</span><span>{{ dateLabel(lastDay) }}</span></div><p v-else class="muted">此时间范围暂无调用记录。</p>
    <PointerTip :anchor="tip"><strong>{{ tip?.row?.date }}</strong><p>总 Token {{ tip?.row?.total?.toLocaleString() ?? '未知' }}</p><p>缓存命中率 {{ tip?.row?.rate == null ? '未知' : tip.row.rate.toFixed(1) + '%' }}</p><small>远程调用 {{ tip?.row?.remoteCalls }} 次 · 本地复用 {{ tip?.row?.localHits }} 次</small></PointerTip>
  </section>
</template>
