# D — 非相关领域迁移研究

研究原则：只提取“等待—中断—交接—重连—恢复”的机制，不复制行业表面风格。来源优先采用官方规范、原始机构和同行评议研究。

## 机制总表（18 个领域，40 个机制）

| # | 原领域 / 机制 | 底层逻辑 | 迁移到墨流后的产品行为 | 风险 |
|---|---|---|---|---|
| 1 | 航空：关键阶段保护区 | 检查流最脆弱时减少非必要打断，而不是要求操作者永远更自律 | 用户提交 Agent 任务后的前 2 秒进入“封存窗口”，只写下一步，不展示其他入口 | 保护区过长会造成控制感下降 |
| 2 | 航空：中断点标记 | 打断不可避免，关键是标记“停在何处”并从受控位置恢复 | checkpoint 只问“回来后第一件事”，自动带上当前任务类型与时间 | 输入过重会变成另一份待办清单 |
| 3 | 航空：检查单流 + 最终核对 | 熟练动作依靠流，检查单只核对关键遗漏，不取代思考 | 回流时先显示用户自己的下一步，再用一项核对确认上下文是否恢复 | 机械打勾可能制造虚假完成感 |
| 4 | 空管：状态区自助简报 | 接班人先从稳定的共享状态自行获取大部分上下文，降低口头负担 | 回流页先呈现一条“状态带”：目标、最后动作、下一步、等待了多久 | 自动采集越多，隐私风险越高 |
| 5 | 空管：只口述变化量 | 静态信息由状态区承载，交接只说刚发生的变化 | 用户回来时只补充“间隙中发生了什么”，而不是重写整个任务 | 如果基线错误，变化量也会误导 |
| 6 | 空管：责任显式移交 | 明确哪一刻责任从 A 到 B，避免双方都以为对方在管 | 用“我接回来了”作为回流确认，记录真实 return latency | 多一次确认可能显得刻意 |
| 7 | 手术：Sign in / Time out / Sign out | 在高风险转换点让所有人短暂停止并核对最低必要信息 | 墨流在“发出任务 / AI 完成 / 回到任务”三个点使用不同的一句确认 | 不能把普通工作医疗化、制造焦虑 |
| 8 | 医疗交接：I-PASS | 严重性、摘要、行动清单、预案、接收者复述共同形成可靠交接 | checkpoint 压缩为“现在为何重要 / 下一步 / 如果失败怎么办”，回流后轻复述 | 字段过多会抬高门槛 |
| 9 | 医疗团队：Brief–Huddle–Debrief | 开始对齐、途中短会调整、结束复盘是三个不同动作 | Intention、Drift/Waiting、Review 使用不同最小界面，不做统一 Dashboard | 频繁 huddle 会打断主任务 |
| 10 | 消防/ICS：面对面移交 + 生效时刻 | 完整简报、明确接管时间并让全体知道，减少责任真空 | 完成提示不等于回流；只有用户确认并做第一动作后 session 才进入 Return | 用户可能忘记确认导致悬挂状态 |
| 11 | 消防/ICS：可检索事件表 | 所有关键状态被结构化保存，能被下一班快速取回 | 每轮生成小型 return packet，可在刷新/离线后恢复 | 记录工作内容需严格最小化 |
| 12 | F1：预先站位 | 窗口出现前 15–20 秒，角色、工具、备件已经到位 | AI 运行时预先准备回来后的第一动作，而不是完成后才想下一步 | 过早准备会错误预测输出 |
| 13 | F1：极短标准呼叫 | 高压窗口只传车、胎、调整量，信息被压缩为共同语言 | 完成提示只展示任务名 + 下一步，避免通知塞入完整报告 | 过度压缩可能丢关键信息 |
| 14 | F1：人类最终放行 | 自动信号聚合，但 go/no-go 由明确的人负责 | 自动检测只能提示“可能完成”；真正回流由用户一击确认 | 手动确认牺牲部分自动化感 |
| 15 | 精益/Andon：异常可见化 | 出现异常就让源头变得可见并获得支援，而非默默产出缺陷 | 用户发现偏航时按“我飘走了”，界面立即收缩到 checkpoint 与一条回流路 | 把每次分心标红会制造羞耻 |
| 16 | 精益/Jidoka：检测后停止 | 自动化的价值不是无人看守，而是异常时停止并呼叫人 | adapter 可在失败时停止等待状态，明确显示“失败/需确认”，不假装仍在工作 | 误报会降低信任 |
| 17 | 看板/JIT：由下游拉取 | 下一步只在需要时被拉出，避免上游堆积 | 微行动不做无限列表；用户只拉取一个与间隙长度匹配的动作 | 选项太少可能不合当下状态 |
| 18 | TCP：三次握手 | 双方确认彼此的当前状态后才建立可靠连接 | 回流握手：系统呈现 checkpoint → 用户确认/修改 → 用户完成第一动作 | 过度仪式化会减慢熟练用户 |
| 19 | TCP：序号与 ACK | 重传能区分新旧数据，确认“收到的是哪一段” | checkpoint 带 session/version，跨标签页只接受最新一次回流包 | 实现复杂度上升 |
| 20 | WebSocket：Ping/Pong | 心跳既保活也验证对端是否仍响应 | 长等待中只进行低频、可关闭的温和状态核对 | 心跳通知会成为新打扰 |
| 21 | 网络：指数退避 | 失败后逐步拉长重试，避免恢复风暴 | 用户未响应回流提示时自动降频，不重复轰炸 | 太快降频可能错过真正可回时机 |
| 22 | 分布式系统：一致性 checkpoint | 保存状态与输入位置，故障后像未失败一样续跑 | checkpoint 同时保存意图、最后动作、下一步和 session 时间点 | 不能保存代码/Prompt 等敏感正文 |
| 23 | Flink：稳定 operator ID | 恢复依赖稳定身份，不依赖会随结构变化的自动 ID | task/session 使用稳定 ID，数据升级后仍能指向同一注意力去向 | ID 设计不当会造成数据孤儿 |
| 24 | Flink：手动 savepoint | 自动 checkpoint 服务故障，手动 savepoint 服务计划性停止/迁移 | 用户可主动“先放这里”，稍后从 return packet 恢复 | 用户可能把它当普通收藏夹 |
| 25 | Flink：checkpoint 间最小进展 | 过密快照本身会吞噬执行时间 | 同一任务短时间内不反复要求 checkpoint，只记录有意义变化 | 需要定义“有意义”的启发式 |
| 26 | 导航：偏航后重算 | 不责备驾驶者回到旧路，而是保留目的地重算当前可行路线 | Drift 后不显示失败；询问“目的还一样吗”，据此给出最短返回动作 | 重算可能让用户不断降低目标 |
| 27 | 导航：route token 保留原意 | 路线可以变化，但原始目的仍被携带 | checkpoint 的 `intent` 与具体 `nextAction` 分离；动作可改，意图不被覆盖 | 目标本身可能已过时 |
| 28 | 导航：阈值触发更新 | 只有时间/距离变化超过阈值才打扰用户 | 等待剩余时间显著变化或状态真正完成时才提示 | 阈值无法适配所有任务 |
| 29 | 中断科学：2 秒准备窗口 | 中断前极短准备就能强化回顾与前瞻记忆 | 用户点击“开始等待”后立即完成一行 checkpoint，目标 2–8 秒 | 强制输入会错过真正紧急切换 |
| 30 | 中断科学：检索线索 | 指向最后动作和系统状态能重新激活暂停目标 | Return 先高亮用户写下的最后动作，不先展示统计 | 线索错误会锚定错误上下文 |
| 31 | 中断科学：下一步提示 | 多任务恢复的成本常在“先恢复哪一个”，下一动作提示可缩短选择 | 回流包始终只有一个主动作，其他内容折叠 | 系统不应替用户伪造优先级 |
| 32 | 中断科学：只在恢复窗口给提示 | 全程辅助不优于短时辅助，还可能混淆目标 | UI 在 Active 期间退场，只在 checkpoint 和 Return 出现 | 过度退场会让状态不透明 |
| 33 | 记忆科学：提取而非重读 | 尝试回忆会增强未来可提取性，单纯重看容易产生熟悉错觉 | 回流先问“你记得下一步吗”，再揭示 checkpoint，而非立即喂答案 | 不能把每次回流变成考试 |
| 34 | 间隔学习：延迟后的再次提取 | 分散的提取比集中重复更利于长期保持 | 第二次使用轻问“上次最有效的回流方式是什么”，形成节律记忆 | 不应推送无关旧记录 |
| 35 | 仪式：短、固定、可预测序列 | 可预测动作降低不确定性，为状态转换提供边界 | signature interaction 固定为“收束一线 → 间隙留白 → 拉回一线” | 仪式若与功能无关会退化为装饰 |
| 36 | 睡眠惯性：渐进唤醒 | 从低唤醒到完整认知需要过渡，不应立刻要求高风险决策 | 回流先给低负荷第一动作（打开文件/读最后一句），再恢复完整工作 | 回流过慢会被用户跳过 |
| 37 | 关系修复：冲突不可避免，恢复可训练 | 健康不等于从不冲突，而是冲突后更快转回建设性状态 | 不以“零分心”为目标，记录每次温和返回并降低 shame | 类比必须克制，避免心理治疗承诺 |
| 38 | 生态恢复：移除压力后自组织 | 恢复不总靠持续干预，有时只需移除压力并留出空间 | 微行动允许“只留白”；系统不强迫呼吸、阅读或锻炼 | 留白若无结束信号容易漂移 |
| 39 | 体育恢复：主观 + 行为双指标 | 单一传感器或时长不能代表 readiness | 复盘同时记录回流延迟与“上下文是否回来”的主观一击 | 指标多会再次变成 Dashboard |
| 40 | 游戏脚手架：失败后给可执行线索 | 只有分数不如明确下一步；低成本重试促进学习 | 回流失败不扣分，直接生成“从 checkpoint 重来”的单击 respawn | 奖励设计可能滑向操纵 |

## 关键来源

- 航空检查流与中断：[FAA AC 120-71B](https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_120-71B.pdf)
- 空管岗位交接：[NASA/FAA Position Relief Briefing](https://ntrs.nasa.gov/api/citations/20250002531/downloads/NASA%20TM20250002531.pdf)
- 空管控制权转移：[EUROCONTROL Coordination and Transfer of Control](https://www.eurocontrol.int/sites/default/files/2023-07/guidelines_for_atc_coordination_and_transfer_of_control_ed-2-0.pdf)
- 手术三段暂停：[WHO Surgical Safety Checklist](https://www.who.int/teams/integrated-health-services/patient-safety/research/safe-surgery/tool-and-resources)
- 医疗交接与闭环沟通：[AHRQ TeamSTEPPS](https://www.ahrq.gov/teamstepps-program/resources/modules/index.html)
- 消防/救援交接：[FEMA ICS Transfer of Command](https://emilms.fema.gov/_is0200c/groups/247.html)
- F1 预站位与人类放行：[Formula 1 Pit Stop Anatomy](https://www.formula1.com/en/latest/article/anatomy-of-a-pit-stop-how-do-f1-teams-service-their-cars-in-less-than-two.5p9LNdd8XJdvP4mRsXoGsB)
- Jidoka、Andon、Kanban：[Toyota Production System History](https://www.toyota-global.com/company/history_of_toyota/75years/text/entering_the_automotive_business/chapter1/section4/item4.html)
- TCP 状态、握手、ACK、重传：[RFC 9293](https://www.rfc-editor.org/rfc/rfc9293.html)
- WebSocket 心跳与退避：[RFC 6455](https://www.rfc-editor.org/info/rfc6455/)
- 分布式 checkpoint：[Apache Flink Checkpointing](https://nightlies.apache.org/flink/flink-docs-stable/docs/concepts/stateful-stream-processing/)
- 手动 savepoint 与稳定 ID：[Apache Flink Savepoints](https://nightlies.apache.org/flink/flink-docs-release-2.3/docs/ops/state/savepoints/)
- 导航偏航/重算事件：[Google Navigation RouteChangedListener](https://developers.google.com/maps/documentation/navigation/android-sdk/reference/com/google/android/libraries/navigation/Navigator.RouteChangedListener)
- 任务中断、线索与恢复：[Effects of cues on task interruption recovery](https://pmc.ncbi.nlm.nih.gov/articles/PMC12271330/)
- 两秒准备窗口：[Managing Interruptions to Improve Diagnostic Decision-Making](https://pmc.ncbi.nlm.nih.gov/articles/PMC10160308/)
- 中断长度与 resumption lag：[Monk et al., 2008](https://pubmed.ncbi.nlm.nih.gov/19102614/)
- 提取练习：[Test-enhanced learning](https://pubmed.ncbi.nlm.nih.gov/16507066/)
- 仪式与失败反应：[Rituals decrease the neural response to performance failure](https://pmc.ncbi.nlm.nih.gov/articles/PMC5452956/)
- 睡眠惯性：[Time course of sleep inertia dissipation](https://pubmed.ncbi.nlm.nih.gov/10188130/)
- 关系冲突恢复：[Recovering from conflict in romantic relationships](https://pubmed.ncbi.nlm.nih.gov/21245491/)
- 生态恢复：[UNEP Ecosystem Restoration](https://www.unep.org/topics/nature-action/conservation-sustainable-use-nature/ecosystem-restoration)
- 体育恢复的混合测量：[USOPC Sports Medicine Research](https://www.usopc.org/sports-medicine-research)
- 游戏反馈脚手架：[Digital Games, Design, and Learning](https://pmc.ncbi.nlm.nih.gov/articles/PMC4748544/)

## 研究收敛

跨领域反复出现的不是“更强控制”，而是五个结构：在中断前压缩状态、明确谁在何时接管、只传变化量、在偏航后保留原意重算、把恢复做成低成本可重复动作。它们共同支持“注意力连续性”假设，但也指出产品不能伪装自动检测：可靠系统先做好手动 checkpoint 与显式回流握手，再逐步接 adapter。

