import sys
import io
import json
import time
import os
import re
from openai import OpenAI

# 修复Windows控制台中文乱码问题
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

client = OpenAI(
    api_key="sk-sp-503ab119dfe74700a26d48bd726d041e",
    base_url="https://coding.dashscope.aliyuncs.com/v1",
)

def get_session_json_path(script_dir: str) -> str:
    """
    生成会话JSON文件路径，格式：data/YYYYMMDD-编号.json

    Args:
        script_dir: 脚本所在目录的绝对路径

    Returns:
        完整的JSON文件路径，如：/path/to/data/20260318-3.json
    """
    # 1. 获取当前日期 YYYYMMDD
    current_date = time.strftime("%Y%m%d")

    # 2. 构建 data 目录路径
    data_dir = os.path.join(script_dir, "data")

    # 3. 确保 data 目录存在
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)

    # 4. 扫描当天已有的JSON文件，找到最大编号
    max_number = 0
    pattern = re.compile(r"^(\d{8})-(\d+)\.json$")

    try:
        for file_name in os.listdir(data_dir):
            match = pattern.match(file_name)
            if match:
                file_date = match.group(1)
                file_number = int(match.group(2))

                # 只统计当天的JSON文件
                if file_date == current_date:
                    max_number = max(max_number, file_number)
    except Exception as e:
        print(f"扫描文件时出错: {e}")

    # 5. 新编号 = 最大编号 + 1
    new_number = max_number + 1

    # 6. 创建新文件名
    new_file_name = f"{current_date}-{new_number}.json"
    new_file_path = os.path.join(data_dir, new_file_name)

    return new_file_path

class ChatRoom:
    """管理对话历史并负责JSON读写"""
    def __init__(self, filename="chat_history.json"):
        self.filename = filename
        self.history = []
        
        # 如果你想每次运行追加历史，可以解除下面的注释：
        # if os.path.exists(self.filename):
        #     with open(self.filename, 'r', encoding='utf-8') as f:
        #         self.history = json.load(f)

    def add_message(self, speaker: str, text: str):
        """添加一条新消息并立即保存到JSON"""
        msg = {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime()),
            "speaker": speaker,
            "text": text
        }
        self.history.append(msg)
        self.save_to_json()
        print(f"\n[{speaker}]: {text}")

    def save_to_json(self):
        """将对话历史持久化为JSON格式"""
        with open(self.filename, 'w', encoding='utf-8') as f:
            json.dump(self.history, f, ensure_ascii=False, indent=4)

    def get_transcript(self) -> str:
        """生成供AI阅读的纯文本剧本"""
        return "\n".join([f"{m['speaker']}: {m['text']}" for m in self.history])

# ==================== 背景知识管理模块 ====================

class FileScanner:
    """扫描 talking_file/ 目录并管理可用文件列表"""

    SUPPORTED_EXTENSIONS = {'.md', '.json', '.pdf'}

    def __init__(self, base_dir: str):
        self.talking_file_dir = os.path.join(base_dir, "talking_file")
        self._ensure_directory_exists()

    def _ensure_directory_exists(self):
        """如果目录不存在则创建"""
        if not os.path.exists(self.talking_file_dir):
            os.makedirs(self.talking_file_dir)

    def scan_files(self) -> list[dict]:
        """
        扫描目录并返回可用文件列表
        返回格式: [
            {"index": 1, "path": "...", "name": "file.md", "type": "md", "size": "2.3KB"},
            ...
        ]
        """
        files = []
        if not os.path.exists(self.talking_file_dir):
            return files

        for idx, filename in enumerate(os.listdir(self.talking_file_dir), 1):
            ext = os.path.splitext(filename)[1].lower()
            if ext in self.SUPPORTED_EXTENSIONS:
                filepath = os.path.join(self.talking_file_dir, filename)
                size = os.path.getsize(filepath)
                files.append({
                    "index": idx,
                    "path": filepath,
                    "name": filename,
                    "type": ext[1:],  # 去掉点号
                    "size": self._format_size(size)
                })
        return files

    def _format_size(self, size_bytes: int) -> str:
        """格式化文件大小显示"""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024:
                return f"{size_bytes:.1f}{unit}"
            size_bytes /= 1024
        return f"{size_bytes:.1f}TB"


class FileParser:
    """统一的多格式文件解析器"""

    @staticmethod
    def parse(filepath: str) -> str:
        """
        根据文件扩展名自动选择解析器
        返回解析后的文本内容
        """
        ext = os.path.splitext(filepath)[1].lower()

        parsers = {
            '.md': FileParser._parse_markdown,
            '.json': FileParser._parse_json,
            '.pdf': FileParser._parse_pdf,
        }

        parser = parsers.get(ext)
        if not parser:
            raise ValueError(f"不支持的文件格式: {ext}")

        return parser(filepath)

    @staticmethod
    def _parse_markdown(filepath: str) -> str:
        """解析 Markdown 文件，直接读取文本内容，保留格式"""
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()

    @staticmethod
    def _parse_json(filepath: str) -> str:
        """
        解析 JSON 文件
        采用灵活策略：支持多种常见结构
        """
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # 策略1: 如果是字符串，直接返回
        if isinstance(data, str):
            return data

        # 策略2: 如果是列表，尝试提取文本字段
        if isinstance(data, list):
            return FileParser._extract_from_list(data)

        # 策略3: 如果是字典，尝试提取常见字段
        if isinstance(data, dict):
            return FileParser._extract_from_dict(data)

        # 策略4: 其他情况，格式化为 JSON 字符串
        return json.dumps(data, ensure_ascii=False, indent=2)

    @staticmethod
    def _extract_from_list(data: list) -> str:
        """从 JSON 列表中提取文本"""
        # 常见结构1: 字符串列表 ["内容1", "内容2"]
        if all(isinstance(item, str) for item in data):
            return "\n\n".join(data)

        # 常见结构2: 字典列表，尝试提取 text/content/message 等字段
        extracted = []
        for item in data:
            if isinstance(item, dict):
                # 尝试常见字段名
                for key in ['text', 'content', 'message', 'body', 'description']:
                    if key in item:
                        extracted.append(str(item[key]))
                        break
            elif isinstance(item, str):
                extracted.append(item)

        return "\n\n".join(extracted) if extracted else json.dumps(data, ensure_ascii=False, indent=2)

    @staticmethod
    def _extract_from_dict(data: dict) -> str:
        """从 JSON 字典中提取文本"""
        # 尝试常见字段名
        for key in ['text', 'content', 'message', 'body', 'description', 'knowledge']:
            if key in data and isinstance(data[key], str):
                return data[key]

        # 如果有 title/content 或 title/text 组合
        if 'title' in data:
            title = data['title']
            content = data.get('content') or data.get('text', '')
            if content:
                return f"# {title}\n\n{content}"

        # 其他情况：格式化为结构化文本
        lines = []
        for key, value in data.items():
            if isinstance(value, str):
                lines.append(f"**{key}**: {value}")
            else:
                lines.append(f"**{key}**: {json.dumps(value, ensure_ascii=False)}")
        return "\n".join(lines)

    @staticmethod
    def _parse_pdf(filepath: str) -> str:
        """
        解析 PDF 文件
        使用 PyMuPDF (fitz) 库提取文本
        """
        try:
            import fitz  # PyMuPDF
        except ImportError:
            raise ImportError(
                "PDF 解析需要安装 PyMuPDF 库。\n"
                "请运行: pip install PyMuPDF"
            )

        doc = fitz.open(filepath)
        text_parts = []

        for page_num, page in enumerate(doc, 1):
            text = page.get_text()
            if text.strip():
                text_parts.append(f"--- 第 {page_num} 页 ---\n{text}")

        doc.close()
        return "\n\n".join(text_parts)


def select_knowledge_files(scanner: FileScanner) -> list[str]:
    """
    交互式文件选择界面
    返回用户选择的文件路径列表
    """
    files = scanner.scan_files()

    if not files:
        print("\n[提示] talking_file/ 目录为空或不存在。")
        print("       请将要作为背景知识的文件放入该目录。")
        print("       支持格式: .md, .json, .pdf\n")
        return []

    print("\n" + "=" * 50)
    print("📚 背景知识文件选择")
    print("=" * 50)
    print("发现以下可用文件：\n")

    for f in files:
        print(f"  [{f['index']}] {f['name']} ({f['type'].upper()}, {f['size']})")

    print("\n" + "-" * 50)
    print("输入说明：")
    print("  - 输入编号（如 1）选择单个文件")
    print("  - 输入多个编号（如 1,2,3 或 1-3）选择多个文件")
    print("  - 输入 0 或直接回车：不使用背景知识")
    print("  - 输入 'all'：选择所有文件")
    print("-" * 50)

    while True:
        user_input = input("\n请选择文件 > ").strip()

        # 空输入或0：不使用背景知识
        if user_input == "" or user_input == "0":
            return []

        # 选择所有文件
        if user_input.lower() == "all":
            return [f['path'] for f in files]

        try:
            selected_indices = parse_selection_input(user_input)
            selected_files = [
                f['path'] for f in files if f['index'] in selected_indices
            ]

            if selected_files:
                print(f"\n已选择 {len(selected_files)} 个文件：")
                for f in files:
                    if f['path'] in selected_files:
                        print(f"  - {f['name']}")
                return selected_files
            else:
                print("[错误] 未选择任何有效文件，请重新输入。")
        except ValueError as e:
            print(f"[错误] {e}，请重新输入。")


def parse_selection_input(user_input: str) -> set[int]:
    """
    解析用户输入的选择
    支持: "1", "1,2,3", "1-3", "1,2,3-5" 等格式
    """
    selected = set()

    for part in user_input.split(','):
        part = part.strip()
        if '-' in part:
            # 处理范围，如 "1-3"
            start, end = part.split('-', 1)
            start, end = int(start.strip()), int(end.strip())
            selected.update(range(start, end + 1))
        else:
            # 处理单个数字
            selected.add(int(part))

    return selected


class KnowledgeManager:
    """管理背景知识的加载、格式化和注入"""

    def __init__(self, base_dir: str):
        self.scanner = FileScanner(base_dir)
        self.selected_files: list[str] = []
        self.knowledge_content: str = ""

    def interactive_select(self) -> bool:
        """
        交互式选择文件并加载内容
        返回是否成功加载背景知识
        """
        self.selected_files = select_knowledge_files(self.scanner)

        if not self.selected_files:
            self.knowledge_content = ""
            return False

        self.knowledge_content = self._load_and_merge_files()
        return bool(self.knowledge_content)

    def _load_and_merge_files(self) -> str:
        """加载并合并所有选中文件的内容"""
        contents = []

        for filepath in self.selected_files:
            filename = os.path.basename(filepath)
            try:
                content = FileParser.parse(filepath)
                # 添加文件来源标识
                contents.append(f"【文件: {filename}】\n{content}")
            except Exception as e:
                print(f"[警告] 无法解析文件 '{filename}': {e}")

        return "\n\n".join(contents)

    def format_for_prompt(self) -> str:
        """将背景知识格式化为可注入 system prompt 的文本"""
        if not self.knowledge_content:
            return ""

        return (
            "\n\n"
            "═════════════════════════════════════════════════════\n"
            "【背景知识】\n"
            "以下是供你参考的背景信息，请在讨论时结合这些内容：\n"
            "═════════════════════════════════════════════════════\n"
            f"{self.knowledge_content}\n"
            "═════════════════════════════════════════════════════\n"
        )

    def get_summary(self) -> str:
        """获取选中的背景知识摘要信息"""
        if not self.selected_files:
            return "未使用背景知识文件"

        filenames = [os.path.basename(f) for f in self.selected_files]
        return f"已加载背景知识: {', '.join(filenames)}"

# ==================== 背景知识管理模块结束 ====================

class Agent:
    """定义AI代理及其行为"""
    # "依次输入：AI名称；性格和背景；使用的模型（默认为qwen3.5-plus）；"
    def __init__(self, name: str, persona: str, model: str = "qwen3.5-plus"):
        self.name = name
        self.persona = persona
        self.model = model
        self.knowledge_manager = None  # 新增：关联知识管理器

    def set_knowledge_manager(self, km: KnowledgeManager):
        """设置背景知识管理器"""
        self.knowledge_manager = km

    def generate_reply(self, chat_room: ChatRoom) -> str:
        """读取当前的房间对话历史，并生成回复"""
        transcript = chat_room.get_transcript()

        # 构建System Prompt，明确AI的人设和任务
        system_prompt = (
            f"你是 {self.name}。你的性格和背景是：{self.persona}。\n"
            "请根据提供的对话历史，给出你的回应。直接说出你的回答，不要加上你的名字前缀，也不要重复别人的话。"
        )

        # 注入背景知识（如果有）
        if self.knowledge_manager:
            background = self.knowledge_manager.format_for_prompt()
            # print(f"\n{background}\n")
            if background:
                system_prompt += background

        try:
            response = client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"【当前对话历史】\n{transcript}\n\n现在轮到你发言了："}
                ],
                temperature=0.7
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            return f"(API调用失败: {e})"

def main():
    # 使用绝对路径，确保JSON文件保存在脚本所在目录下的data文件夹
    script_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = get_session_json_path(script_dir)
    room = ChatRoom(json_path)

    # 显示JSON文件保存位置
    print(f"📄 JSON文件: {json_path}\n")

    # ===== 新增：背景知识管理 =====
    knowledge_manager = KnowledgeManager(script_dir)
    knowledge_manager.interactive_select()
    print(f"\n{knowledge_manager.get_summary()}\n")
    # =============================

    # 1. 定义两个立场不同的AI
    agent_a = Agent("AI科学家", "一位极度理性、注重数据和逻辑的计算机科学家，认为一切都可以用算法解释。","glm-5")
    agent_b = Agent("人文哲学家", "一位感性、关注伦理、道德和人类情感的哲学家，对纯粹的技术主义持怀疑态度。","kimi-k2.5")
    agent_c = Agent("金融学家", "一位理性的金融学家，擅长沉着冷静分析问题。","MiniMax-M2.5")
    agent_d = Agent("奥运冠军", "一位充满活力的体育运动员，对生活充满激情。","qwen3-max-2026-01-23")
    agent_e = Agent("顶级计算机科学家", "一位极具创新精神的计算机科学家，对未来充满憧憬。","qwen3.5-plus")

    agents = [agent_a, agent_b,agent_c,agent_d,agent_e]

    # ===== 新增：为所有 Agent 设置背景知识管理器 =====
    for agent in agents:
        agent.set_knowledge_manager(knowledge_manager)
    # ==============================================

    # 2. 设定初始讨论话题
    # topic = "人类是否应该将所有决策权（包括司法和医疗）交给超级人工智能？"
    topic = input("请输入想要讨论的话题：").strip()

    room.add_message("System", f"讨论开始，今日议题：{topic}")
    
    turn = 0
    print("==================================================")
    print("多主体AI聊天室已启动。")
    print("操作说明：")
    print("- 按【Enter】键：让下一个AI继续发言。")
    print("- 输入AI名称（如：AI科学家）并按Enter：让指定AI发言。")
    print("- 输入其他文字并按Enter：以人类身份插入对话。")
    print("- 输入【exit】：结束程序。")
    print(f"\n下一个发言的AI: {agents[turn % len(agents)].name}")
    print("==================================================")

    # 3. 循环对话机制
    while True:
        # 询问人类是否需要干预
        user_input = input("\n[按Enter继续 / 输入AI名称 / 插话 / 'exit'退出] > ").strip()

        # 处理用户输入
        if user_input.lower() == 'exit':
            print("聊天结束，已保存JSON文件。")
            break
        elif user_input == "":
            # 按Enter，让下一个AI发言
            current_agent = agents[turn % len(agents)]
        elif user_input in [agent.name for agent in agents]:
            # 输入了AI名称，找到对应的AI
            current_agent = next(agent for agent in agents if agent.name == user_input)
        else:
            # 输入了其他内容，作为人类插话
            room.add_message("人类(Admin)", user_input)
            # 继续让当前轮次的AI发言
            current_agent = agents[turn % len(agents)]

        # 让AI生成回复并加入房间
        reply = current_agent.generate_reply(room)
        room.add_message(current_agent.name, reply)

        # 更新轮次（只有按Enter或插话后才增加，指定AI发言不改变轮次）
        if user_input == "" or user_input not in [agent.name for agent in agents]:
            turn += 1

        # 提示下一个发言的AI
        next_agent = agents[turn % len(agents)]
        print(f"\n[提示] 下一个发言的AI: {next_agent.name}")

if __name__ == "__main__":
    main()

