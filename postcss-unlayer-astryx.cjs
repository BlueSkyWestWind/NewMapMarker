/**
 * Astryx 스타일시트의 `@layer` 껍데기를 벗긴다(Astryx 파일에만 적용).
 *
 * 이 앱은 Tailwind v3라 프리플라이트(`*{border:0}`, `button{background:transparent}` 등)가
 * 계층 밖(unlayered)에서 나온다. 계층 안에 있는 Astryx 스타일은 특이도와 상관없이 그것에 져서
 * 버튼 배경·입력 테두리가 사라진다. Astryx 규칙을 계층 밖으로 꺼내면 클래스 선택자(특이도 0,1,0)로
 * 요소 선택자(0,0,1)를 이긴다. 앱 전역 CSS는 건드리지 않는다.
 */
const plugin = () => ({
  postcssPlugin: "unlayer-astryx",
  Once(root) {
    const file = root.source?.input?.file ?? "";
    if (!file.includes("@astryxdesign")) return;
    root.walkAtRules("layer", (rule) => {
      if (rule.nodes) rule.replaceWith(rule.nodes);
      else rule.remove();
    });
  },
});
plugin.postcss = true;

module.exports = plugin;
