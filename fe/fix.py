import subprocess

head_content = subprocess.check_output(['git', 'show', 'HEAD:src/components/AiTalkTab.tsx']).decode('utf-8')
with open('src/components/AiTalkTab.tsx', 'r', encoding='utf-8') as f:
    current_content = f.read()

start_marker = 'SEAMLESS MODE NAVIGATION STRIP'
end_marker = 'TAB VIEW 1: ADVANCED HANDS-FREE VOICE CALL EXPERIENCE'

start_idx_head = head_content.find(start_marker)
end_idx_head = head_content.find(end_marker)

start_idx_cur = current_content.find(start_marker)
end_idx_cur = current_content.find(end_marker)

if start_idx_head != -1 and end_idx_head != -1 and start_idx_cur != -1 and end_idx_cur != -1:
    correct_block = head_content[start_idx_head:end_idx_head]
    
    # We also want to remove the 'Guide:' div from the correct block!
    guide_str = '''        <div className={`rounded-[12px] px-3 py-2 text-[10px] leading-relaxed ${isLight ? 'bg-white/80 text-gray-600' : 'bg-[#131f24] text-gray-300'}`}>
          💡 <span className="mr-1 text-[9px] font-black uppercase tracking-widest text-emerald-500">{globalLang === 'en' ? 'Guide:' : 'Chỉ dẫn:'}</span>
          {currentTopicConfig.desc}
        </div>'''
    if guide_str in correct_block:
        correct_block = correct_block.replace(guide_str, '')
    else:
        print("Guide string not found in block! It might have different whitespace.")
        
    new_content = current_content[:start_idx_cur] + correct_block + current_content[end_idx_cur:]
    with open('src/components/AiTalkTab.tsx', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('SUCCESS')
else:
    print('COULD NOT FIND MARKERS')
