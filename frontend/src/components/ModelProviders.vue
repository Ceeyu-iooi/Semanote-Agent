<script setup>
import { computed, ref, watch } from "vue";
const settings = defineModel({ type: Object, required: true });
const selected = ref("");
const current = computed(
  () =>
    settings.value.providers.find((item) => item.id === selected.value) ||
    settings.value.providers.find(
      (item) => item.id === settings.value.provider,
    ) ||
    settings.value.providers[0],
);
watch(
  () => settings.value.providers.map((item) => item.id).join(","),
  () => {
    if (!settings.value.providers.some((item) => item.id === selected.value))
      selected.value = settings.value.provider;
  },
  { immediate: true },
);
function add() {
  const id = `custom_${Date.now().toString(36)}`;
  settings.value.providers.push({
    id,
    name: "自定义供应商",
    baseUrl: "",
    model: "",
    apiKey: "",
    hasApiKey: false,
    timeoutSeconds: 120,
    maxOutputTokens: 8192,
    jsonMode: true,
  });
  selected.value = id;
}
function remove(id) {
  if (settings.value.providers.length === 1) return;
  settings.value.providers = settings.value.providers.filter(
    (item) => item.id !== id,
  );
  if (settings.value.provider === id)
    settings.value.provider = settings.value.providers[0].id;
  selected.value = settings.value.provider;
}
</script>
<template>
  <div class="provider-settings">
    <nav aria-label="模型供应商" class="provider-list">
      <button
        v-for="item in settings.providers"
        :key="item.id"
        type="button"
        :class="{ selected: current?.id === item.id }"
        :aria-current="current?.id === item.id ? 'true' : undefined"
        @click="selected = item.id"
      >
        <span class="provider-icon">{{ item.name.slice(0, 1) }}</span
        ><span>{{ item.name }}</span
        ><i
          class="provider-state-dot"
          :class="{ configured: item.hasApiKey }"
          :aria-label="item.hasApiKey ? '已配置密钥' : '未配置密钥'"
        ></i>
      </button>
      <button type="button" class="provider-add" @click="add">
        ＋ 自定义供应商
      </button>
    </nav>
    <section v-if="current" :key="current.id" class="provider-detail">
      <header class="provider-detail-header">
        <span class="provider-icon">{{ current.name.slice(0, 1) }}</span>
        <div>
          <h3>{{ current.name }}</h3>
          <p>
            {{ current.model || "OpenAI 兼容接口" }} ·
            {{ settings.provider === current.id ? "默认供应商" : "可选供应商" }}
          </p>
        </div>
      </header>
      <div class="provider-credentials">
        <header>
          <strong>API 配置</strong
          ><span class="quiet-badge">{{
            current.hasApiKey ? "密钥已保存在本机" : "待配置密钥"
          }}</span>
        </header>
        <div class="provider-fields">
          <label
            >供应商名称<input
              v-model="current.name"
              class="form-control"
              maxlength="80"
              required
          /></label>
          <label
            >基础地址<input
              v-model="current.baseUrl"
              class="form-control"
              type="url"
              placeholder="https://…/v1"
              required
          /></label>
          <label
            >模型名称<input
              v-model="current.model"
              class="form-control"
              required
          /></label>
          <label
            >API Key<input
              v-model="current.apiKey"
              class="form-control"
              type="password"
              autocomplete="new-password"
              :placeholder="
                current.hasApiKey
                  ? '留空保留已保存的密钥'
                  : '填写此供应商的密钥'
              "
          /></label>
          <details>
            <summary class="caption">高级调用参数</summary>
            <div class="provider-number-fields">
              <label
                >超时 / 秒<input
                  v-model.number="current.timeoutSeconds"
                  class="form-control"
                  type="number"
                  min="10"
                  max="240"
                  required /></label
              ><label
                >输出 token 上限<input
                  v-model.number="current.maxOutputTokens"
                  class="form-control"
                  type="number"
                  min="512"
                  max="32768"
                  required
              /></label>
            </div>
            <label class="checkbox-label caption"
              ><input v-model="current.jsonMode" type="checkbox" />使用 JSON
              响应模式</label
            >
          </details>
        </div>
        <div class="provider-actions">
          <label class="provider-default"
            ><input
              v-model="settings.provider"
              type="radio"
              :value="current.id"
            />设为默认供应商</label
          ><button
            type="button"
            class="text-action caption"
            :disabled="settings.providers.length === 1"
            @click="remove(current.id)"
          >
            移除供应商
          </button>
        </div>
      </div>
      <p class="provider-settings-note">
        状态仅表示本机是否保存密钥；实际调用结果见调用日志。地址变更需重新填写密钥，保存后对新任务生效。
      </p>
    </section>
  </div>
</template>
