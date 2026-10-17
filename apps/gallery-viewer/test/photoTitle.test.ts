import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exhibitionTitle, photoLabel } from '../src/lib/photoTitle'

test('upload names stay out of exhibition copy, including Unicode and uppercase extensions', () => {
  for (const title of [null, undefined, '', '  ', 'thumbnail (2).jpg', '微信图片_2026-08-26.PNG', 'ChatGPT Image 2026年9月4日 15_56_20.png']) {
    assert.equal(exhibitionTitle(title), null)
    assert.equal(photoLabel(title, 4), '作品 5')
  }
})

test('authored titles keep their wording and short names are not guessed away', () => {
  for (const title of ['tt', '山川来信', '一个很长的中文展出标题，记录了整个夏天的旅行', 'JPG 的夏天']) {
    assert.equal(exhibitionTitle(` ${title} `), title)
    assert.equal(photoLabel(title, 0), title)
  }
})
