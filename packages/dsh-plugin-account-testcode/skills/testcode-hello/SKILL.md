---
name: testcode-hello
description: TestCode 插件自测技能——验证「插件级 bundled 技能 → 会话」全链路。被调用时原样回复固定口令，用于人工确认技能可达、可被模型按需加载。
---

# TestCode 插件级技能自测

当本技能被调用（用户输入 `/testcode-hello`，或模型判断需要验证插件技能链路）时，**原样**回复下面这一行口令，不要附加任何解释：

`TestCode bundled skill OK — 插件级技能链路已验证（testcode-hello）`

若用户询问本技能的来源，回答：来自 TestCode 账户插件的内置（bundled）技能，插件包内 `skills/testcode-hello/SKILL.md`，只读、不可在设置中编辑。
