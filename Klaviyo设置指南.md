# Klaviyo Welcome Flow 设置指南

## 背景

Roomo 网站已接入 newsletter 订阅系统，用户通过弹窗或页脚输入邮箱后会自动加入 Klaviyo 的 list。现在需要设置自动欢迎邮件流程。

---

## 第一步：创建 Welcome Flow（自动欢迎邮件）

1. 登录 Klaviyo → 左侧菜单点 **Flows**
2. 点右上角 **Create Flow**
3. 选择 **Welcome Series** 模板（或从空白创建）
4. 触发器（Trigger）设置：
   - 类型选 **List**
   - 选择 list：**Roomo Newsletter**（ID: `01KSNKBTZR8BM9EYCFA01Z3ZDD`）
5. 编辑第一封邮件内容：
   - 主题行建议：`Welcome to Roomo! Here's your 10% off`
   - 邮件正文要包含：
     - 欢迎语
     - **优惠码**（具体码稍后提供，先用占位符 `WELCOME10`）
     - 优惠码使用说明（下单时输入优惠码即可享首月 9 折）
     - 有效期提示（建议 7 天或 14 天）
   - 品牌视觉保持与网站一致（#49372A 深棕、#FAF6F1 米白、Manrope 字体）
6. 点 **Review and Turn On** 启用 Flow

---

## 第二步：给已有订阅者补发邮件（Campaign 群发）

因为 Flow 只对启用之后新加入的人生效，已经订阅的用户需要通过一次性群发（Campaign）补发：

1. 左侧菜单点 **Campaigns**
2. 点 **Create Campaign**
3. 收件人选择：
   - Segment/List 选 **Roomo Newsletter** list
4. 邮件内容：复制 Welcome Flow 第一封邮件的设计
5. 发送

---

## 注意事项

- Flow 创建后记得点 **Turn On**（左上角状态开关），否则不会自动触发
- 后续新订阅者会自动收到 Welcome Flow 邮件，不需要再手动发
- 订阅者的 `first_name` 字段已通过弹窗收集，邮件模板可以用 `{{ first_name|default:'there' }}` 做个性化称呼
- 如需修改邮件内容，直接在 Flow 里编辑即可，不影响之前已发送的
