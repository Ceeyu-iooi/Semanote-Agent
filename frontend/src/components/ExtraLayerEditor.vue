<script setup>
import { computed, onUnmounted, reactive, ref, watch } from "vue";
import { labelNames } from "../api.js";
import { sourcePositions } from "../annotationPresentation.js";
const props = defineProps({
  task: String,
  selection: Object,
  text: String,
  existing: Object,
});
const emit = defineEmits(["add", "cancel", "pending"]);
const form = reactive({
  itemText: "",
  label: "",
  subject: "",
  object: "",
  time: "",
  location: "",
  cause: "",
  result: "",
  suggestion: "",
  explanation: "",
});
const options = {
  sentiment: ["POSITIVE", "NEGATIVE", "NEUTRAL"],
  intent: ["INFORM", "REQUEST", "QUESTION", "COMMAND", "PROMISE", "OTHER"],
  semantic: ["TOPIC", "LIST_ITEM", "EXPLANATION", "CONCLUSION", "OTHER"],
  errors: ["GRAMMAR", "WORD_CHOICE", "TYPO", "PUNCTUATION"],
};
const roleNames = {
  subject: "主体",
  object: "客体",
  time: "时间",
  location: "地点",
  cause: "原因",
  result: "结果",
};
const baseline = ref("");
const dirty = computed(() => JSON.stringify(form) !== baseline.value);
function loadForm(value) {
  for (const key of Object.keys(form)) form[key] = "";
  form.label = options[props.task]?.[0] || "";
  if (value) {
    for (const key of Object.keys(form)) form[key] = value[key] || "";
    for (const role of ["subject", "object"])
      if (value[role] && typeof value[role] === "object")
        form[role] = value[role].itemText;
    for (const role of Object.keys(roleNames))
      if (value.roles)
        form[role] = (value.roles[role] || [])
          .map((entry) => (typeof entry === "string" ? entry : entry.itemText))
          .join("；");
  }
  baseline.value = JSON.stringify(form);
  emit("pending", { task: props.task, dirty: false });
}
watch(
  () => [props.task, props.existing],
  ([, value]) => loadForm(value),
  { immediate: true },
);
watch(
  () => props.selection,
  (value) => {
    if (value) form.itemText = value.text;
  },
);
watch(dirty, (value) => emit("pending", { task: props.task, dirty: value }));
onUnmounted(() => emit("pending", { task: props.task, dirty: false }));
function cancel() {
  loadForm(null);
  emit("cancel");
}
const valid = computed(
  () => form.itemText.trim() && (props.task === "paragraphs" || form.label),
);
function add() {
  const item = {
    itemText: form.itemText,
    occurrence: props.existing?.occurrence || 0,
  };
  if (props.task !== "paragraphs") item.label = form.label;
  if (props.selection?.text === form.itemText)
    item.occurrence = sourcePositions(props.text, form.itemText).indexOf(
      props.selection.start,
    );
  const sameEvidence =
    props.existing?.itemText === item.itemText &&
    (props.existing?.occurrence || 0) === item.occurrence;
  if (props.task === "relations")
    for (const role of ["subject", "object"])
      item[role] =
        sameEvidence && props.existing?.[role]?.itemText === form[role]
          ? props.existing[role]
          : form[role];
  if (props.task === "events")
    item.roles = Object.fromEntries(
      Object.keys(roleNames).map((role) => {
        const old = props.existing?.roles?.[role] || [],
          oldText = old
            .map((entry) =>
              typeof entry === "string" ? entry : entry.itemText,
            )
            .join("；");
        return [
          role,
          sameEvidence && oldText === form[role]
            ? old
            : form[role]
              ? form[role].split("；").filter(Boolean)
              : [],
        ];
      }),
    );
  if (props.task === "errors") {
    item.suggestion = form.suggestion;
    item.explanation = form.explanation;
  }
  emit("add", item);
  loadForm(null);
}
</script>
<template>
  <form class="extra-layer-editor" @submit.prevent="add">
    <p class="caption muted">划选原文填写证据；新增条目在保存时校验。</p>
    <label
      >原文证据<textarea
        v-model="form.itemText"
        class="form-control"
        rows="2"
        required
      ></textarea></label
    ><label v-if="task !== 'paragraphs'"
      >类别<select
        v-if="options[task]"
        v-model="form.label"
        class="form-select"
      >
        <option v-for="label in options[task]" :key="label" :value="label">
          {{ labelNames[label] }}
        </option></select
      ><input
        v-else
        v-model="form.label"
        class="form-control"
        maxlength="80"
        placeholder="例如：推荐 / 购买"
        required /></label
    ><template v-if="task === 'relations'"
      ><label
        >主体<input
          v-model="form.subject"
          class="form-control"
          required /></label
      ><label
        >客体<input
          v-model="form.object"
          class="form-control"
          required /></label></template
    ><template v-if="task === 'events'"
      ><label v-for="(name, role) in roleNames" :key="role"
        >{{ name
        }}<input
          v-model="form[role]"
          class="form-control"
          placeholder="原文词面；多项用中文分号分隔" /></label></template
    ><template v-if="task === 'errors'"
      ><label
        >修改建议<input v-model="form.suggestion" class="form-control" /></label
      ><label
        >原因<input
          v-model="form.explanation"
          class="form-control"
          required /></label></template
    ><button class="btn btn-outline-primary" :disabled="!valid">
      {{ existing ? "更新条目" : "添加条目" }}</button
    ><button
      v-if="existing || dirty"
      type="button"
      class="text-action"
      @click="cancel"
    >
      取消编辑
    </button>
  </form>
</template>
