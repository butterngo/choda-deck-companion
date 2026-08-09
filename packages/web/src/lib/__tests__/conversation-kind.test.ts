import { describe, it, expect } from "vitest";
import {
  conversationLabel,
  extractPosition,
  stripPositionLine,
} from "../conversation-kind";

// Every string here is a real title from the running store.
describe("conversationLabel", () => {
  it("shortens a capture URL from the LEFT, keeping the distinguishing tail", () => {
    // The failure this guards: ordinary right-truncation keeps the protocol and
    // host — which every one of these shares — and throws away the only part
    // that differs. "http://localhost:3000/tung-nike-store/remote-w…" tells you
    // nothing about which capture it is.
    const r = conversationLabel(
      "Screenshot from http://localhost:3000/tung-nike-store/remote-workflow/automation"
    );
    expect(r.kind).toBe("capture");
    expect(r.label).toBe("localhost:3000 … /automation");
    expect(r.label).not.toMatch(/^http/);
  });

  it("classifies an HTTP-verb title as a request, not a discussion", () => {
    const r = conversationLabel(
      "GET https://graph.microsoft.com/v1.0/users/hngo1@mantu.com/photo/$value"
    );
    expect(r.kind).toBe("request");
    expect(r.label).toBe("graph.microsoft.com … /$value");
  });

  it("leaves a non-URL capture source alone rather than mangling it", () => {
    // "Screenshot from unknown" is a real row; running it through a URL parser
    // would either throw or produce nonsense.
    const r = conversationLabel("Screenshot from unknown");
    expect(r.kind).toBe("capture");
    expect(r.label).toBe("unknown");
  });

  it("classifies a network bundle as a capture, keeping the request count", () => {
    // Found by checking the classifier against the live store, not by
    // imagining shapes: this was landing in "Discussions" alongside real
    // threads, which is the exact noise the filter exists to remove.
    const r = conversationLabel(
      "Network bundle (25 requests) from http://localhost:3002/admin/projects"
    );
    expect(r.kind).toBe("request");
    expect(r.label).toBe("25 requests · localhost:3002 … /projects");
  });

  it("handles a bundle whose URL is a bare host", () => {
    const r = conversationLabel(
      "Network bundle (2 requests) from https://timesheet.arp.mantu.com/"
    );
    expect(r.kind).toBe("request");
    expect(r.label).toBe("2 requests · timesheet.arp.mantu.com");
  });

  it("treats a real discussion title as prose and leaves it intact", () => {
    const title = "Customer Audience node — FE polish shipped, field_descriptions[] still open";
    const r = conversationLabel(title);
    expect(r.kind).toBe("discussion");
    expect(r.label).toBe(title);
  });

  it("keeps the full title for hover, whatever the label became", () => {
    const title = "Screenshot from http://localhost:3000/a/b/c";
    expect(conversationLabel(title).full).toBe(title);
  });

  it("does not crash on a malformed URL", () => {
    const r = conversationLabel("Screenshot from http://[not-a-url");
    expect(r.kind).toBe("capture");
    expect(typeof r.label).toBe("string");
  });
});

describe("extractPosition", () => {
  it("lifts the position the etiquette requires every turn to state", () => {
    expect(extractPosition("Position: needs_clarification.\n\nRound of UX fixes…")).toBe(
      "needs_clarification"
    );
    expect(extractPosition("Position: signoff\n\nOrdered — take it as given.")).toBe("signoff");
  });

  it("returns null when a turn states none, rather than inventing one", () => {
    expect(extractPosition("Recorded as the decision above.")).toBeNull();
  });

  it("reads a position that carries a trailing qualifier", () => {
    // A real turn from the store. `extractPosition` must still find it even
    // though the line does not end after the word.
    expect(
      extractPosition("Position: needs_clarification — on optionsSource cutover timing.")
    ).toBe("needs_clarification");
  });

  it("removes the line once it is shown as a badge, without eating the body", () => {
    const out = stripPositionLine("Position: signoff\n\nOrdered — take it as given.");
    expect(out).not.toMatch(/Position:/);
    expect(out).toContain("Ordered — take it as given.");
  });

  it("KEEPS a position line that carries the author's qualifier", () => {
    // Found in the running app: stripping this would delete
    // "on optionsSource cutover timing" — real meaning — to save repeating one
    // word the badge already shows. The badge summarises; the line explains.
    const line = "Position: needs_clarification — on optionsSource cutover timing.";
    expect(stripPositionLine(`${line}\n\nRest of the turn.`)).toContain(line);
  });
});
