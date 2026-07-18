# 多主体AI讨论群系统

一个基于 OpenAI API 的多 AI 主体讨论系统，支持 5 个不同人格的 AI 进行深度对话，并支持从文件加载背景知识。

## 📋 功能特性

- ✅ **多 AI 人格**：5 个不同视角的 AI 主体（科学家、哲学家、金融学家、奥运冠军、计算机科学家）
- ✅ **背景知识注入**：支持从 .md、.json、.pdf 文件加载背景知识
- ✅ **交互式对话**：支持用户插话、指定 AI 发言
- ✅ **自动保存**：对话历史自动保存为 JSON 格式
- ✅ **格式转换**：提供 Jupyter Notebook 转换对话为 Markdown

## 🚀 快速开始

### 1. 安装依赖

```bash
pip install openai PyMuPDF
```

### 2. 配置 API

修改 `AI讨论群.py` 中的 API 配置：

```python
client = OpenAI(
    api_key="你自己的api key",
    base_url="对应的url",
)
```

### 3. 准备背景知识文件（可选）

将背景知识文件放入 `talking_file/` 目录：
- 支持 `.md`（Markdown）
- 支持 `.json`（多种格式）
- 支持 `.pdf`（需要安装 PyMuPDF）

### 4. 运行程序

```bash
python AI讨论群.py
```

## 📖 使用说明

### 基本使用

1. **启动程序**：运行后会提示选择背景知识文件
2. **选择文件**：
   - 输入编号选择单个文件
   - 输入 `1,2,3` 或 `1-3` 选择多个文件
   - 输入 `all` 选择所有文件
   - 输入 `0` 或回车跳过背景知识
3. **输入话题**：输入想要讨论的话题
4. **参与对话**：
   - 按 **Enter** 键：让下一个 AI 继续发言
   - 输入 **AI 名称**：让指定 AI 发言
   - 输入 **其他文字**：以人类身份插入对话
   - 输入 **exit**：结束程序

### 背景知识文件格式

#### Markdown 格式（.md）

```markdown
# 主题标题

内容...

## 子标题

详细说明...
```

#### JSON 格式（.json）

**格式 1：纯文本（推荐）**
```json
{
  "text": "这里是背景知识内容..."
}
```

**格式 2：带标题**
```json
{
  "title": "讨论主题背景",
  "content": "详细内容..."
}
```

**格式 3：多条目**
```json
[
  {"title": "条目1", "content": "内容1"},
  {"title": "条目2", "content": "内容2"}
]
```

**格式 4：纯文本列表**
```json
[
  "第一条背景知识",
  "第二条背景知识"
]
```

#### PDF 格式（.pdf）

程序会自动提取 PDF 文件中的文本内容，按页分段显示。

## 🎭 AI 人格介绍

| 名称 | 模型 | 特点 |
|------|------|------|
| AI 科学家 | glm-5 | 极度理性、注重数据和逻辑 |
| 人文哲学家 | kimi-k2.5 | 感性、关注伦理道德 |
| 金融学家 | MiniMax-M2.5 | 理性分析风险与资源配置 |
| 奥运冠军 | qwen3-max | 充满激情与实践经验 |
| 顶级计算机科学家 | qwen3.5-plus | 创新前沿视角 |

## 📁 项目结构

```
AI讨论群/
├── AI讨论群.py              # 主程序
├── 转换json.ipynb           # Jupyter Notebook 转换工具
├── readme.md                # 项目文档
├── data/                    # 对话历史存储
│   └── YYYYMMDD-N.json
├── talking_file/            # 背景知识文件
│   ├── 医疗AI伦理背景.md
│   ├── 就业影响数据.json
│   └── 气候与AI.json
└── trans_data/              # 转换输出目录
```

## 🔧 高级配置

### 修改 AI 人格

在 `main()` 函数中修改 Agent 定义：

```python
agent_a = Agent("AI名称", "性格和背景描述", "使用的模型")
```

### 修改支持的文件格式

在 `FileScanner` 类中修改：

```python
SUPPORTED_EXTENSIONS = {'.md', '.json', '.pdf'}  # 添加或删除格式
```

### 自定义背景知识注入格式

修改 `KnowledgeManager.format_for_prompt()` 方法中的格式化字符串。

## 📝 示例对话

查看 `trans_data/` 目录下的 Markdown 文件，了解完整的对话示例：

- [天赋与努力讨论](trans_data/tran_20260322-1.md)
- [AI 决策权讨论](trans_data/tran_debate_history.md)

## ⚠️ 注意事项

1. **API 密钥安全**：请勿将 API 密钥提交到公开仓库
2. **文件编码**：所有文本文件请使用 UTF-8 编码
3. **PDF 解析**：PDF 解析依赖 PyMuPDF 库，如未安装会提示错误
4. **对话保存**：每次运行会自动创建新的 JSON 文件，格式为 `YYYYMMDD-编号.json`

## 🐛 常见问题

**Q: 程序提示找不到 talking_file 目录？**

A: 程序会自动创建该目录，首次运行时目录为空是正常的。

**Q: JSON 文件解析失败？**

A: 确保使用 UTF-8 编码，并检查 JSON 格式是否正确。可以使用在线 JSON 验证工具。

**Q: PDF 文件无法解析？**

A: 运行 `pip install PyMuPDF` 安装依赖库。

**Q: 如何添加新的 AI 人格？**

A: 在 `main()` 函数中创建新的 `Agent` 实例，并添加到 `agents` 列表中。

## 📄 许可证

本项目仅供学习和研究使用。

---

**最后更新**：2026-03-22