export const DEVICE_MODE=import.meta.env.VITE_APP_MODE==='device';
export const LOCAL_MODE=DEVICE_MODE||(import.meta.env.DEV&&import.meta.env.VITE_DEMO_MODE==='true');
