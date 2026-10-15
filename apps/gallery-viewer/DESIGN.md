---
name: VIE 摄影空间
description: 以完整作品为中心的流动私人影展
colors:
  ink: "#080c15"
  indigo: "#101523"
  mist: "#263951"
  silver: "#edf1f6"
  warm: "#e6b789"
  muted: "#9daabd"
typography:
  display:
    fontFamily: "Georgia, 'Songti SC', 'SimSun', serif"
    fontSize: "clamp(28px, 3.3vw, 56px)"
    fontWeight: 400
    lineHeight: 1.3
  label:
    fontFamily: "system-ui, sans-serif"
    fontSize: "12px"
rounded:
  dock: "18px"
  dock-item: "12px"
---

# Design System: VIE 摄影空间

## Overview

**Creative North Star: "流动的私人影展"**

照片保持完整比例，以大幅主作品和逐渐退后的侧翼形成空间。界面沿画面边缘布置，细线、克制光感和衬线标题保持摄影展的安静气质。配色延续用户已认可的版本。

## Colors

墨色与深靛构成底色，雾蓝表达空间层次，银白用于主要文字。暖光点缀保持轻量；环幕偏暖棕、波浪偏青绿，作品自身颜色不随背景色偏移。

## Typography

标题采用 Georgia 与中文宋体回退。控件采用系统无衬线，计数使用等宽数字。手机展览标题为 32px，当前作品标题为 17px。

## Layout

桌面顶部边距为 28px / 44px；当前照片信息位于左下，前后切换位于右下，风格条位于底部中央。700px 以下改用手机排版并预留安全区；镜头围绕当前作品适配，不缩小整个集合以塞入屏幕。

## Elevation & Depth

深度来自照片的真实位置、旋转、尺度与遮挡。薄装裱承接光线，照片材质保持清晰呈色。界面仅在底部风格条保留轻量阴影和背景模糊。

## Shapes

作品保留矩形轮廓和原始比例；风格条为圆角容器，前后切换为圆形按钮。细边框提供边界，避免厚重装饰争夺作品注意力。

## Components

空间浏览统一使用一个照片进度，拖动、滚轮、方向键与按钮共享它。螺旋、环幕、波浪切换保留当前作品。自动漫游逐张停留；暂停、打开大图和减少动态偏好抑制自动推进。

导航按钮桌面为 52px，手机为 44px。风格按钮用背景和按下状态共同表示选择。键盘焦点为清晰的浅蓝描边。空间模式无法运行时仍可使用平面展览。

## Do's and Don'ts

- Do 保留当前主题配色、图片比例和清晰的当前作品。
- Do 保持手机可读性与键盘操作，尊重暂停和减少动态偏好。
- Don't 用持续提示遮挡作品，或通过缩小全部照片替代手机取景。
- Don't 将背景氛围色强加到摄影作品上。
