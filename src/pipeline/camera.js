// camera.js — getUserMedia adaptativo por device

export function pickConstraints() {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isTablet = /iPad|Tablet/i.test(navigator.userAgent) || (isMobile && Math.min(window.innerWidth, window.innerHeight) >= 600);
  let target;
  if (isMobile && !isTablet) target = { width: 640, height: 360 };
  else if (isTablet) target = { width: 960, height: 540 };
  else target = { width: 1280, height: 720 };
  return {
    audio: false,
    video: {
      facingMode: "user",
      width: { ideal: target.width },
      height: { ideal: target.height },
      frameRate: { ideal: 30, max: 60 },
    },
  };
}

export async function startCamera(videoEl) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("GETUSERMEDIA INDISPONÍVEL");
  }
  const stream = await navigator.mediaDevices.getUserMedia(pickConstraints());
  videoEl.srcObject = stream;
  await videoEl.play();
  await new Promise((r) => {
    if (videoEl.readyState >= 2) return r();
    videoEl.onloadeddata = () => r();
  });
  return {
    stream,
    width: videoEl.videoWidth,
    height: videoEl.videoHeight,
    stop() {
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
