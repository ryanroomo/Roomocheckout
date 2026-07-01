# Roomo Account Page

## 文件结构

```
roomo-delivery/
├── roomo-account_preview.html    ← 主页面
├── product-config.txt            ← 产品配置总览（价格、物品、颜色）
└── images/                       ← 产品图片
    ├── README.md                 ← 图片命名规范
    └── living-hudson-haze-full.png  ← 按格式放图
```

## 使用方法

1. 按 `images/README.md` 的命名格式放入产品图片
2. 打开 `roomo-account_preview.html`，修改顶部 `USER` 配置
3. 页面自动加载对应图片并计算价格

## 图片命名格式

`{套组}-{颜色}-{配置}.png`

例: `living-hudson-haze-no-lamp.png`

## Status States

| # | Status | 说明 |
|---|--------|------|
| 1 | New User | 新用户 |
| 2 | Checkout Incomplete | 未完成结账 |
| 3 | Plan Confirmed | 需预约配送 |
| 4 | Delivery Scheduled | 配送已预约 |
| 5 | Arriving Soon | 即将到达 |
| 6 | Active Rental | 租赁中 |
| 7 | Payment Failed | 支付失败 |
| 8 | Renewal Reminder | 续租提醒 |
| 9 | Return Scheduled | 退还已预约 |
| 10 | Plan Ended | 已结束 |
