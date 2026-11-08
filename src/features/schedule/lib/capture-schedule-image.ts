/**
 * 시설일정 표를 PNG 그림 한 장으로 만든다(화면 그대로).
 * 화면의 표는 스크롤 영역 안에 있어 일부가 가려지므로, 표를 화면 밖에 통째로 복제해 그 복제본을 찍는다.
 * html2canvas(약 190KB)는 저장을 누르는 순간에만 불러온다.
 */

/** 그림 한 변의 최대 픽셀. 넘으면 배율을 낮춘다(브라우저 캔버스 한도 대비). */
const MAX_SIDE_PX = 8000;
const FALLBACK_BACKGROUND = "#020617";
const PADDING_PX = 16;

function pickBackground(): string {
  const color = window.getComputedStyle(document.body).backgroundColor;
  // 투명이면 어두운 기본 배경을 쓴다.
  return color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent" ? color : FALLBACK_BACKGROUND;
}

export async function captureScheduleImage(source: HTMLElement, title: string): Promise<Blob> {
  const html2canvas = (await import("html2canvas")).default;
  const background = pickBackground();
  const textColor = window.getComputedStyle(source).color;

  const wrapper = document.createElement("div");
  wrapper.setAttribute("aria-hidden", "true");
  Object.assign(wrapper.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    width: `${source.scrollWidth + PADDING_PX * 2}px`,
    padding: `${PADDING_PX}px`,
    background,
    color: textColor,
    boxSizing: "border-box",
  });

  const heading = document.createElement("div");
  heading.textContent = title;
  Object.assign(heading.style, { fontSize: "16px", fontWeight: "600", marginBottom: "10px" });

  const clone = source.cloneNode(true) as HTMLElement;
  Object.assign(clone.style, { height: "auto", maxHeight: "none", overflow: "visible", width: `${source.scrollWidth}px` });

  wrapper.append(heading, clone);
  document.body.append(wrapper);
  try {
    // html2canvas는 `overflow: hidden`(truncate) 칸의 글자를 위아래로 잘라 그린다.
    // 글이 실제로 잘리지 않는 칸(가로로 넘치지 않는 칸)은 자르기를 풀어 글자가 온전히 그려지게 한다.
    // 넘쳐서 말줄임이 필요한 칸만 그대로 둔다.
    for (const element of clone.querySelectorAll<HTMLElement>("*")) {
      const style = window.getComputedStyle(element);
      if (style.overflowX === "visible" && style.overflowY === "visible") continue;
      if (element.scrollWidth <= element.clientWidth + 1) {
        element.style.overflow = "visible";
        element.style.textOverflow = "clip";
      }
    }
    const width = wrapper.offsetWidth;
    const height = wrapper.offsetHeight;
    const scale = Math.max(1, Math.min(2, MAX_SIDE_PX / Math.max(width, height)));
    const canvas = await html2canvas(wrapper, {
      backgroundColor: background,
      scale,
      useCORS: true,
      logging: false,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
    });
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("그림을 만들지 못했습니다."))), "image/png"),
    );
  } finally {
    wrapper.remove();
  }
}

/** 브라우저 다운로드로 저장한다. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
