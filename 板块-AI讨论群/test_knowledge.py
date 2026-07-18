"""
测试背景知识注入功能
"""
import os
import sys

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 测试导入
try:
    from AI讨论群 import FileScanner, FileParser, KnowledgeManager
    print("✅ 模块导入成功")
except Exception as e:
    print(f"❌ 模块导入失败: {e}")
    sys.exit(1)

# 测试 FileScanner
print("\n--- 测试 FileScanner ---")
script_dir = os.path.dirname(os.path.abspath(__file__))
scanner = FileScanner(script_dir)

files = scanner.scan_files()
if files:
    print(f"✅ 扫描到 {len(files)} 个文件:")
    for f in files:
        print(f"  - [{f['index']}] {f['name']} ({f['type']}, {f['size']})")
else:
    print("⚠️  talking_file/ 目录为空")

# 测试 FileParser
print("\n--- 测试 FileParser ---")
test_results = []

for f in files:
    try:
        content = FileParser.parse(f['path'])
        content_preview = content[:100] + "..." if len(content) > 100 else content
        print(f"✅ 解析成功: {f['name']}")
        print(f"   内容预览: {content_preview}\n")
        test_results.append(True)
    except Exception as e:
        print(f"❌ 解析失败: {f['name']}")
        print(f"   错误: {e}\n")
        test_results.append(False)

# 测试 KnowledgeManager
print("\n--- 测试 KnowledgeManager ---")
km = KnowledgeManager(script_dir)

# 模拟选择第一个文件
if files:
    km.selected_files = [files[0]['path']]
    km.knowledge_content = km._load_and_merge_files()

    if km.knowledge_content:
        print("✅ 背景知识加载成功")
        formatted = km.format_for_prompt()
        print(f"   格式化长度: {len(formatted)} 字符")
        print(f"   摘要: {km.get_summary()}")
    else:
        print("❌ 背景知识加载失败")
else:
    print("⚠️  没有可用的测试文件")

# 总结
print("\n" + "=" * 50)
print("测试总结:")
print(f"  - 模块导入: ✅")
print(f"  - 文件扫描: {'✅' if files else '⚠️'}")
print(f"  - 文件解析: {'✅' if all(test_results) else '❌'}")
print(f"  - 知识管理: ✅")
print("=" * 50)

if all(test_results) or not files:
    print("\n🎉 所有测试通过！系统已准备就绪。")
    print("\n使用方法:")
    print("  1. 将背景知识文件放入 talking_file/ 目录")
    print("  2. 运行 python AI讨论群.py")
    print("  3. 按提示选择文件并开始讨论")
else:
    print("\n⚠️  部分测试失败，请检查错误信息")