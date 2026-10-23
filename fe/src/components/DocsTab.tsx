import React, { useState } from 'react';
import { BookOpen, Palette, CheckCircle, AlertTriangle, Accessibility, Compass, CheckSquare } from 'lucide-react';

export default function DocsTab() {
  const [activeSubTab, setActiveSubTab] = useState<'tokens' | 'components' | 'accessibility' | 'anti_patterns' | 'checklist'>('tokens');

  const navItems = [
    { id: 'tokens', label: 'Token nền tảng' },
    { id: 'components', label: 'Quy tắc component' },
    { id: 'accessibility', label: 'Tiếp cận' },
    { id: 'anti_patterns', label: 'Anti-patterns' },
    { id: 'checklist', label: 'QA checklist' },
  ] as const;

  return (
    <div className="bg-[#131f24] rounded-md border border-[#37464f] p-6 text-[#f1f7fb] custom-scrollbar overflow-y-auto max-h-[85vh] space-y-6">
      <div className="border-b border-[#37464f] pb-6">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="w-8 h-8 text-[#58cc02]" />
          <h2 className="text-2xl font-bold tracking-tight">SpeakJoy UI Plan</h2>
        </div>
        <p className="text-[#52656d]">
          Tài liệu gọn để thống nhất thiết kế, nội dung và cách triển khai giao diện học tiếng Anh cho trẻ em Việt Nam.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[#202f36] pb-4">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveSubTab(item.id)}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
              activeSubTab === item.id ? 'bg-[#58cc02] text-black' : 'bg-[#1a2a33] text-gray-300 hover:bg-[#223541]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {activeSubTab === 'tokens' && (
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-[#58cc02]">
            <Palette className="w-5 h-5" />
            <h3 className="text-lg font-black">Token nền tảng</h3>
          </div>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="bg-[#182631] rounded-xl border border-[#37464f] p-4">
              <div className="font-black mb-2">Typography</div>
              <div>`font.family.primary = din-round`</div>
              <div>`font.size.base = 17px`</div>
              <div>`font.weight.base = 500`</div>
              <div>`font.lineHeight.base = 20px`</div>
            </div>
            <div className="bg-[#182631] rounded-xl border border-[#37464f] p-4">
              <div className="font-black mb-2">Color</div>
              <div>`color.text.primary = #f1f7fb`</div>
              <div>`color.surface.base = #000000`</div>
              <div>`color.surface.muted = #131f24`</div>
              <div>`color.surface.raised = #37464f`</div>
            </div>
          </div>
        </section>
      )}

      {activeSubTab === 'components' && (
        <section className="space-y-4 text-sm">
          <div className="flex items-center gap-2 text-[#1cb0f6]">
            <Compass className="w-5 h-5" />
            <h3 className="text-lg font-black">Quy tắc component</h3>
          </div>
          <div className="bg-[#182631] rounded-xl border border-[#37464f] p-4 space-y-2">
            <div>Mọi component tương tác phải có đủ trạng thái: `default`, `hover`, `focus-visible`, `active`, `disabled`, `loading`, `error`.</div>
            <div>Khoảng cách và cỡ chữ phải dùng token, không tạo ngoại lệ cục bộ.</div>
            <div>Nội dung dài, tràn dòng và empty state phải được xử lý rõ ràng ngay trong spec.</div>
          </div>
        </section>
      )}

      {activeSubTab === 'accessibility' && (
        <section className="space-y-4 text-sm">
          <div className="flex items-center gap-2 text-[#ffc800]">
            <Accessibility className="w-5 h-5" />
            <h3 className="text-lg font-black">Tiếp cận</h3>
          </div>
          <div className="bg-[#182631] rounded-xl border border-[#37464f] p-4 space-y-2">
            <div>Chuẩn mục tiêu: WCAG 2.2 AA.</div>
            <div>Focus ring phải luôn nhìn thấy bằng bàn phím.</div>
            <div>Text và nút hành động phải đạt độ tương phản đủ cao trên nền tối.</div>
            <div>Mọi hành động chính đều cần dùng được bằng chuột, touch và bàn phím.</div>
          </div>
        </section>
      )}

      {activeSubTab === 'anti_patterns' && (
        <section className="space-y-4 text-sm">
          <div className="flex items-center gap-2 text-[#ff4b4b]">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="text-lg font-black">Anti-patterns</h3>
          </div>
          <div className="bg-[#182631] rounded-xl border border-[#37464f] p-4 space-y-2">
            <div>Không dùng text tương phản thấp hoặc ẩn focus.</div>
            <div>Không dùng label mơ hồ như “Nhấn vào đây”.</div>
            <div>Không ship component mà thiếu định nghĩa trạng thái hoặc hành vi responsive.</div>
          </div>
        </section>
      )}

      {activeSubTab === 'checklist' && (
        <section className="space-y-4 text-sm">
          <div className="flex items-center gap-2 text-[#58cc02]">
            <CheckSquare className="w-5 h-5" />
            <h3 className="text-lg font-black">QA checklist</h3>
          </div>
          <div className="bg-[#182631] rounded-xl border border-[#37464f] p-4 space-y-2">
            <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-[#58cc02]" /> Token dùng nhất quán trên toàn màn.</div>
            <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-[#58cc02]" /> Focus-visible và keyboard flow chạy đúng.</div>
            <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-[#58cc02]" /> Không còn text Việt lỗi dấu ở các màn chính.</div>
            <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-[#58cc02]" /> Component không vỡ layout trên desktop và mobile.</div>
          </div>
        </section>
      )}
    </div>
  );
}
