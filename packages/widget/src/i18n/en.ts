import type { Translations } from "./types.js";

export const en: Translations = {
  // Panel
  "panel.title": "Feedbacks",
  "panel.ariaLabel": "Colaborate feedback panel",
  "panel.feedbackList": "Feedback list",
  "panel.loading": "Loading feedbacks",
  "panel.close": "Close panel",
  "panel.deleteAll": "Delete all",
  "panel.deleteAllConfirmTitle": "Delete all",
  "panel.deleteAllConfirmMessage": "Delete all feedbacks for this project? This action cannot be undone.",
  "panel.search": "Search...",
  "panel.searchAria": "Search feedbacks",
  "panel.filterAll": "All",
  "panel.loadError": "Failed to load",
  "panel.retry": "Retry",
  "panel.empty": "No feedback yet",
  "panel.showMore": "Show more",
  "panel.showLess": "Show less",
  "panel.resolve": "Resolve",
  "panel.reopen": "Reopen",
  "panel.delete": "Delete",
  "panel.cancel": "Cancel",
  "panel.confirmDelete": "Delete",

  // Feedback type labels
  "type.question": "Question",
  "type.change": "Change",
  "type.bug": "Bug",
  "type.other": "Other",

  // FAB menu
  "fab.aria": "Colaborate \u2014 Feedback menu",
  "fab.messages": "Messages",
  "fab.annotate": "Annotate",
  "fab.annotations": "Annotations",

  // Annotator
  "annotator.instruction": "Pick a shape, then draw on the area to comment",
  "annotator.cancel": "Cancel",

  // Shape picker
  "picker.aria": "Shape picker",
  "shape.rectangle": "Rectangle",
  "shape.circle": "Circle",
  "shape.arrow": "Arrow",
  "shape.line": "Line",
  "shape.textbox": "Text",
  "shape.freehand": "Freehand",

  // Popup
  "popup.ariaLabel": "Feedback form",
  "popup.placeholder": "Describe your feedback...",
  "popup.textareaAria": "Feedback message",
  "popup.submitHintMac": "\u2318+Enter to send",
  "popup.submitHintOther": "Ctrl+Enter to send",
  "popup.cancel": "Cancel",
  "popup.submit": "Send",

  // Identity modal
  "identity.title": "Identify yourself",
  "identity.nameLabel": "Name",
  "identity.namePlaceholder": "Your name",
  "identity.emailLabel": "Email",
  "identity.emailPlaceholder": "your@email.com",
  "identity.cancel": "Cancel",
  "identity.submit": "Continue",

  // Markers
  "marker.approximate": "Approximate position (confidence: {confidence}%)",
  "marker.aria": "Feedback #{number}: {type} — {message}",

  // FAB badge
  "fab.badge": "{count} unresolved feedbacks",

  // Accessibility — screen reader announcements
  "feedback.sent.confirmation": "Feedback sent successfully",
  "feedback.error.message": "Failed to send feedback",
  "feedback.deleted.confirmation": "Feedback deleted",

  // Badge
  "badge.count": "{count} unresolved feedbacks",

  // Session mode (Phase 2)
  "session.toggle": "Session",
  "session.toggleAriaLabel": "Toggle session mode",
  "session.panelTitle": "Review session",
  "session.panelEmpty": "No drafts yet. Annotations made while session mode is on will collect here.",
  "session.submit": "Submit session",
  "session.cancel": "Discard session",
  "session.submittedConfirmation": "Session submitted",
  "fab.session": "Session",
};
