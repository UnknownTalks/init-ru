// Run the same device/scale selection before first paint and at runtime.
export function resolveInterfacePreference(saved={},width=innerWidth,touch=navigator.maxTouchPoints>0||matchMedia('(pointer:coarse)').matches){
 const scales=[100,110,125,150,200],valid=value=>scales.includes(value);
 const mobile=width<=760||width<=1100&&touch;
 const desktopScale=valid(saved.desktopScale)?saved.desktopScale:valid(saved.scale)?saved.scale:125;
 const mobileScale=valid(saved.mobileScale)?saved.mobileScale:100;
 return {desktopScale,mobileScale,scale:mobile?mobileScale:desktopScale,mobile};
}
