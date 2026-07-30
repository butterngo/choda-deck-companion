import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CaptureSendPanel } from "../CaptureSendPanel";
import { MAX_CAPTURE_BYTES } from "../../lib/capture";
import * as api from "../../api";

const PNG = "data:image/png;base64,AAAA";

describe("CaptureSendPanel", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("POSTs the image with projectId + title and reports the opened conversation", async () => {
    const send = vi
      .spyOn(api, "sendImageToConversation")
      .mockResolvedValue({ id: "CONV-9", destination: "conversation" });
    render(<CaptureSendPanel dataUrl={PNG} projectId="choda-deck" connected />);
    fireEvent.change(screen.getByLabelText("conversation title"), { target: { value: "My shot" } });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({ dataUrl: PNG, projectId: "choda-deck", title: "My shot" }),
    );
    expect(await screen.findByText(/opened conversation CONV-9/i)).toBeInTheDocument();
  });

  it("disables Send and explains when no project is resolved (AC-4)", () => {
    render(<CaptureSendPanel dataUrl={PNG} projectId={null} connected />);
    expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled();
    expect(screen.getByText(/pick a workspace/i)).toBeInTheDocument();
  });

  it("disables Send when disconnected (AC-5)", () => {
    render(<CaptureSendPanel dataUrl={PNG} projectId="choda-deck" connected={false} />);
    expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled();
    expect(screen.getByText(/adapter unreachable/i)).toBeInTheDocument();
  });

  it("rejects an over-cap image client-side, never POSTing (AC-6)", () => {
    const send = vi.spyOn(api, "sendImageToConversation");
    const huge = "x".repeat(MAX_CAPTURE_BYTES + 1);
    render(<CaptureSendPanel dataUrl={huge} projectId="choda-deck" connected />);
    expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/larger than the/i);
    expect(send).not.toHaveBeenCalled();
  });

  it("surfaces a failed send and keeps the panel usable for retry (AC-5)", async () => {
    vi.spyOn(api, "sendImageToConversation").mockRejectedValue(new Error("HTTP 500 for /capture"));
    render(<CaptureSendPanel dataUrl={PNG} projectId="choda-deck" connected />);
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    expect(await screen.findByText(/send failed: HTTP 500/i)).toBeInTheDocument();
    // Still enabled to retry.
    expect(screen.getByRole("button", { name: /^send$/i })).toBeEnabled();
  });
});
