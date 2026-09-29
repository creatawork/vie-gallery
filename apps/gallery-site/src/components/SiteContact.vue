<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSite } from '../siteContext'
import { showToast } from '../toast'
import { trackEvent } from '../brand/track'
import { submitInquiry } from '../api'

const site = useSite()
const contact = computed(() => site.config.content.contact)
const wechatId = computed(() => contact.value.wechatId?.trim() ?? '')
const lead = computed(() => contact.value.formIntro?.trim() || '联系我')

const name = ref('')
const message = ref('')
const sending = ref(false)
const sent = ref(false)

async function copyWechat(): Promise<void> {
  if (!wechatId.value) return
  trackEvent('site_contact_click', { channel: 'wechat-copy' })
  try {
    await navigator.clipboard.writeText(wechatId.value)
    showToast('微信号已复制')
  } catch {
    showToast('复制失败，请手动复制：' + wechatId.value)
  }
}

async function submit(): Promise<void> {
  if (sending.value || !name.value.trim() || !message.value.trim()) return
  sending.value = true
  trackEvent('site_form_submit', { hasContact: !!wechatId.value })
  try {
    if (site.demo) {
      showToast('演示模式：留言不会真正发送')
      name.value = ''
      message.value = ''
      return
    }
    const ok = await submitInquiry(site.subdomain, { name: name.value.trim(), message: message.value.trim() })
    if (ok) {
      sent.value = true
      name.value = ''
      message.value = ''
      showToast('留言已送达，会尽快回复你')
    } else {
      // 询盘存储端点未上线（WP-13）：不谎报成功，引导微信转化
      showToast('留言通道即将开放，请先复制微信联系我')
    }
  } catch {
    showToast('提交失败，请稍后再试，或直接复制微信联系我')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <section id="contact" class="contact-sec" v-reveal>
    <div class="wrap">
      <div class="contact">
        <div class="contact-intro">
          <p class="lead">{{ lead }}</p>
          <div class="wechat-row" v-if="wechatId">
            <span class="wechat-id">微信：{{ wechatId }}</span>
            <button type="button" class="btn btn-copy" @click="copyWechat">复制</button>
          </div>
          <p class="hint" v-if="contact.formEnabled">或直接留言：</p>
        </div>
        <form v-if="contact.formEnabled" class="form" @submit.prevent="submit">
          <div>
            <label for="bs-name">怎么称呼你</label>
            <input id="bs-name" v-model="name" required placeholder="称呼 / 昵称" autocomplete="name" />
          </div>
          <div>
            <label for="bs-message">想拍什么，或想说的话</label>
            <textarea id="bs-message" v-model="message" rows="4" required placeholder="时间、地点、大概的想法都可以写在这里"></textarea>
          </div>
          <p class="form-success" v-if="sent">已收到你的留言，会尽快回复。</p>
          <div class="actions">
            <button class="btn btn-primary" type="submit" :disabled="sending">
              {{ sending ? '发送中…' : '发送留言' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>
