import type { FeedbackResponse, SessionResponse } from "@colaborate/core";
import { el, setText } from "./dom-utils.js";
import type { TFunction } from "./i18n/index.js";
import type { ThemeColors } from "./styles/theme.js";

export interface SessionPanelOptions {
  onSubmit: () => void;
  onCancel: () => void;
}

/**
 * Session popover — lists drafts in the active session + submit/cancel actions.
 *
 * Lives inside the Shadow DOM. Hidden by default; `open()` / `close()` / `toggle()`
 * manage visibility. `render(session, drafts)` updates the body. Kept deliberately
 * small — the main feedback panel covers the rich-list use case.
 */
export class SessionPanel {
  private root: HTMLElement;
  private listBody: HTMLElement;
  private submitBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private _isOpen = false;
  private currentDraftCount = 0;

  constructor(
    shadowRoot: ShadowRoot,
    private readonly colors: ThemeColors,
    private readonly t: TFunction,
    private readonly options: SessionPanelOptions,
  ) {
    this.root = el("div", { class: "sp-session-panel" });
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-label", this.t("session.panelTitle"));
    this.root.setAttribute("aria-hidden", "true");
    this.root.style.position = "fixed";
    this.root.style.right = "20px";
    this.root.style.bottom = "96px";
    this.root.style.width = "320px";
    this.root.style.padding = "16px";
    this.root.style.borderRadius = "14px";
    this.root.style.background = colors.glassBg;
    this.root.style.backdropFilter = "blur(24px)";
    this.root.style.border = `1px solid ${colors.glassBorder}`;
    this.root.style.boxShadow = `0 16px 48px ${colors.shadow}`;
    this.root.style.fontFamily = '"Inter",system-ui,-apple-system,sans-serif';
    this.root.style.color = colors.text;
    this.root.style.display = "none";
    this.root.style.zIndex = "2147483647";

    const title = el("div", { class: "sp-session-panel-title" });
    title.style.fontSize = "14px";
    title.style.fontWeight = "600";
    title.style.marginBottom = "10px";
    setText(title, this.t("session.panelTitle"));

    this.listBody = el("div", { class: "sp-session-panel-list" });
    this.listBody.style.display = "flex";
    this.listBody.style.flexDirection = "column";
    this.listBody.style.gap = "8px";
    this.listBody.style.maxHeight = "280px";
    this.listBody.style.overflowY = "auto";
    this.listBody.style.marginBottom = "12px";

    const btnRow = el("div", { class: "sp-session-panel-actions" });
    btnRow.style.display = "flex";
    btnRow.style.gap = "8px";
    btnRow.style.justifyContent = "flex-end";

    this.cancelBtn = document.createElement("button");
    this.cancelBtn.type = "button";
    this.cancelBtn.dataset.sessionCancel = "true";
    setText(this.cancelBtn, this.t("session.cancel"));
    this.cancelBtn.style.height = "32px";
    this.cancelBtn.style.padding = "0 12px";
    this.cancelBtn.style.borderRadius = "8px";
    this.cancelBtn.style.border = `1px solid ${colors.border}`;
    this.cancelBtn.style.background = "transparent";
    this.cancelBtn.style.color = colors.textTertiary;
    this.cancelBtn.style.fontSize = "13px";
    this.cancelBtn.style.cursor = "pointer";
    this.cancelBtn.addEventListener("click", () => this.options.onCancel());

    this.submitBtn = document.createElement("button");
    this.submitBtn.type = "button";
    this.submitBtn.dataset.sessionSubmit = "true";
    setText(this.submitBtn, this.t("session.submit"));
    this.submitBtn.style.height = "32px";
    this.submitBtn.style.padding = "0 14px";
    this.submitBtn.style.borderRadius = "8px";
    this.submitBtn.style.border = "none";
    this.submitBtn.style.background = colors.accent;
    this.submitBtn.style.color = "#fff";
    this.submitBtn.style.fontSize = "13px";
    this.submitBtn.style.fontWeight = "600";
    this.submitBtn.style.cursor = "pointer";
    this.submitBtn.addEventListener("click", () => {
      if (this.currentDraftCount === 0) return;
      this.options.onSubmit();
    });

    btnRow.appendChild(this.cancelBtn);
    btnRow.appendChild(this.submitBtn);

    this.root.appendChild(title);
    this.root.appendChild(this.listBody);
    this.root.appendChild(btnRow);

    shadowRoot.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  render(session: SessionResponse | null, drafts: FeedbackResponse[]): void {
    this.listBody.replaceChildren();
    this.currentDraftCount = drafts.length;

    if (!session || drafts.length === 0) {
      const empty = el("div");
      empty.dataset.sessionEmpty = "true";
      empty.style.fontSize = "13px";
      empty.style.color = this.colors.textTertiary;
      empty.style.padding = "12px";
      empty.style.lineHeight = "1.5";
      setText(empty, this.t("session.panelEmpty"));
      this.listBody.appendChild(empty);
      this.submitBtn.disabled = true;
      this.submitBtn.style.opacity = "0.5";
      this.submitBtn.style.cursor = "not-allowed";
      return;
    }

    for (const draft of drafts) {
      const card = el("div");
      card.dataset.sessionDraft = draft.id;
      card.style.padding = "8px 10px";
      card.style.borderRadius = "8px";
      card.style.border = `1px solid ${this.colors.border}`;
      card.style.fontSize = "13px";
      card.style.lineHeight = "1.4";
      card.style.color = this.colors.text;
      setText(card, draft.message.length > 100 ? `${draft.message.slice(0, 100)}…` : draft.message);
      this.listBody.appendChild(card);
    }

    this.submitBtn.disabled = false;
    this.submitBtn.style.opacity = "1";
    this.submitBtn.style.cursor = "pointer";
  }

  open(): void {
    this._isOpen = true;
    this.root.style.display = "block";
    this.root.setAttribute("aria-hidden", "false");
  }

  close(): void {
    this._isOpen = false;
    this.root.style.display = "none";
    this.root.setAttribute("aria-hidden", "true");
  }

  toggle(): void {
    if (this._isOpen) this.close();
    else this.open();
  }

  destroy(): void {
    this.root.remove();
  }
}
