import type { ColaborateConfig, ColaborateInstance } from "@colaborate/core";
import { launch } from "./launcher.js";

export type {
  AnchorData,
  AnnotationPayload,
  AnnotationResponse,
  ColaborateConfig,
  ColaborateInstance,
  ColaboratePublicEvents,
  ColaborateStore,
  FeedbackPayload,
  FeedbackResponse,
  FeedbackStatus,
  FeedbackType,
  Geometry,
  Shape,
} from "@colaborate/core";

export type { Identity } from "./identity.js";

/**
 * Initialize the Colaborate feedback widget.
 *
 * @example
 * ```ts
 * import { initColaborate } from '@colaborate/widget'
 *
 * const { destroy } = initColaborate({
 *   endpoint: '/api/colaborate',
 *   projectName: 'my-project',
 * })
 * ```
 */
export function initColaborate(config: ColaborateConfig): ColaborateInstance {
  return launch(config);
}

/** @deprecated Renamed — use `initColaborate`. Alias kept for one transition release. */
export const initSiteping = initColaborate;
