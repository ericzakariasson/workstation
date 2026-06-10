import type { GlassApi } from "@shared/api";

export const glass: GlassApi = (window as unknown as { glass: GlassApi }).glass;
