import {
  Presentation,
  PresentationFile,
  row,
  column,
  fill,
  hug,
  fixed,
  wrap,
  shape,
  text,
} from "file:///C:/Users/hahoa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/@oai+artifact-tool@file+loc_004d9bd7ba94e0f5fe405971ffda5b08/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";
import { writeFile } from "node:fs/promises";

const W = 1920;
const H = 1080;
const outPptx = "E:/test/speak joy/output/speak-joy-ttdn-10min.pptx";
const outPreviewDir = "E:/test/speak joy/output/previews";

const presentation = Presentation.create({ slideSize: { width: W, height: H } });

function addSlide(title, bullets, footer = "TTDN 2026 | Speak Joy") {
  const slide = presentation.slides.add();
  slide.compose(
    column(
      { width: fill, height: fill, padding: { x: 96, y: 72 }, gap: 28 },
      [
        shape({
          width: fixed(220),
          height: fixed(10),
          fill: "#0EA5A5",
          borderRadius: "rounded-full",
        }),
        text(title, {
          width: fill,
          height: hug,
          style: { fontSize: 56, bold: true, color: "#0B1324", fontFace: "Calibri" },
        }),
        ...bullets.map((line) =>
          row({ width: fill, height: hug, gap: 16 }, [
            text("•", {
              width: fixed(24),
              height: hug,
              style: { fontSize: 34, color: "#0EA5A5", bold: true, fontFace: "Calibri" },
            }),
            text(line, {
              width: wrap(1650),
              height: hug,
              style: { fontSize: 32, color: "#1F2937", fontFace: "Calibri" },
            }),
          ]),
        ),
        text(footer, {
          width: fill,
          height: hug,
          style: { fontSize: 18, color: "#64748B", fontFace: "Calibri" },
        }),
      ],
    ),
    { frame: { left: 0, top: 0, width: W, height: H }, baseUnit: 8 },
  );
}

addSlide("Báo cáo TTDN: Hệ thống Speak Joy", [
  "Đề tài: Xây dựng hệ thống hỗ trợ học tiếng Anh cho trẻ em ứng dụng AI.",
  "Đơn vị thực tập: Digi Dinos | Thời gian: 02/03/2026 - 15/05/2026.",
  "Mục tiêu trình bày: kiến trúc, kết quả đạt được, hạn chế và hướng phát triển.",
]);

addSlide("Bối cảnh và mục tiêu thực tập", [
  "Bài toán: trẻ em cần môi trường học tiếng Anh tương tác, dễ tiếp cận và có phản hồi tức thì.",
  "Mục tiêu tổng quát: vận dụng kiến thức để xây dựng hệ thống học tiếng Anh tích hợp AI.",
  "Mục tiêu kỹ thuật: triển khai Frontend + Backend + AI Service và kiểm thử thực tế.",
]);

addSlide("Tổng quan dự án Speak Joy", [
  "Frontend Next.js: giao diện cho phụ huynh và trẻ em (topics, kid-bot, practice, history).",
  "Backend FastAPI: auth, children, topics, sessions; trung gian dữ liệu và nghiệp vụ.",
  "AI Service: xử lý audio, chấm điểm phát âm, phản hồi bằng văn bản và giọng nói.",
]);

addSlide("Kiến trúc hệ thống 3 lớp", [
  "Lớp 1 - FE: thu âm, hiển thị bài học, hiển thị phản hồi luyện nói.",
  "Lớp 2 - BE: xác thực, quản lý hồ sơ học sinh, lưu lịch sử và điểm số.",
  "Lớp 3 - AI: ASR -> Pronunciation Scoring -> LLM Feedback -> TTS.",
]);

addSlide("Pipeline AI luyện nói", [
  "B1: trẻ ghi âm câu nói và gửi lên hệ thống.",
  "B2: ASR chuyển giọng nói thành văn bản; đánh giá độ rõ phát âm.",
  "B3: LLM sinh nhận xét; TTS tạo phản hồi giọng nói để trẻ nghe lại.",
  "Kết quả: tăng tính tương tác và hỗ trợ chỉnh phát âm ngay sau mỗi lượt luyện.",
]);

addSlide("Công việc thực hiện tại doanh nghiệp", [
  "Tham gia xây dựng API cho auth, quản lý học sinh, chủ đề học tập và lịch sử phiên học.",
  "Tích hợp luồng luyện nói realtime/REST giữa frontend và AI service.",
  "Kiểm thử chức năng, sửa lỗi giao diện, tối ưu kết nối API và trải nghiệm người dùng.",
]);

addSlide("Kết quả đạt được", [
  "Hệ thống chạy ổn định theo kiến trúc FE-BE-AI, dữ liệu lưu trên PostgreSQL/Supabase.",
  "Có các màn hình cốt lõi: đăng nhập, chủ đề, kid-bot, luyện nói, lịch sử học tập.",
  "Đã triển khai phản hồi AI theo phiên học, theo dõi tiến độ và điểm luyện tập.",
]);

addSlide("Hạn chế hiện tại", [
  "Hiệu năng ASR chưa tối ưu khi audio dài hoặc nhiều request đồng thời.",
  "Chất lượng chấm điểm phát âm phụ thuộc vào chất lượng âm thanh đầu vào.",
  "Nội dung học tập và game hóa còn hạn chế, chưa cá nhân hóa sâu theo từng học sinh.",
]);

addSlide("Định hướng phát triển", [
  "Tối ưu pipeline AI và cơ chế hàng đợi để tăng khả năng chịu tải.",
  "Mở rộng kho bài học/chủ đề theo độ tuổi và mức năng lực.",
  "Cá nhân hóa lộ trình học bằng lịch sử tương tác và mức tiến bộ của từng trẻ.",
]);

addSlide("Bài học kinh nghiệm và kết luận", [
  "Phân tích yêu cầu sớm giúp giảm thay đổi và giảm lỗi về sau.",
  "Tích hợp AI cần đồng thời hiểu mô hình, dữ liệu đầu vào và hành vi người dùng thực tế.",
  "TTDN giúp nâng cao kỹ năng kỹ thuật, làm việc nhóm và tư duy sản phẩm.",
  "Kết luận: Speak Joy đã có nền tảng tốt để tiếp tục phát triển thành sản phẩm giáo dục AI.",
], "Q&A | Cảm ơn thầy/cô và hội đồng");

const pptxBlob = await PresentationFile.exportPptx(presentation);
await pptxBlob.save(outPptx);

for (let i = 0; i < presentation.slides.count; i += 1) {
  const slide = presentation.slides.getItem(i);
  const pngBlob = await slide.export({ format: "png" });
  const bytes = new Uint8Array(await pngBlob.arrayBuffer());
  await writeFile(`${outPreviewDir}/slide-${String(i + 1).padStart(2, "0")}.png`, bytes);
}

console.log(`PPTX: ${outPptx}`);
console.log(`Previews: ${outPreviewDir}`);
