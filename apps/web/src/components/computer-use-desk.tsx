"use client";

import { useState } from "react";
import { requestComputerAction, approveComputerAction, denyComputerAction, listComputerRequests, type ComputerUseRequest } from "@shared/plugins/computer-use";
import { Card, CardHeader, Chip, EmptyState, buttonClass, ghostButtonClass } from "./ui";

const ACTIONS: Array<ComputerUseRequest["action"]> = ["screenshot", "click", "type", "scroll", "keypress", "shell"];

export function ComputerUseDesk() {
  const [requests, setRequests] = useState<ComputerUseRequest[]>(listComputerRequests());
  const [action, setAction] = useState<ComputerUseRequest["action"]>("screenshot");
  const [reason, setReason] = useState("");

  const refresh = () => setRequests(listComputerRequests());

  const handleRequest = () => {
    requestComputerAction(action, { description: reason }, reason || `${action} action`);
    refresh();
    setReason("");
  };

  const handleApprove = (id: string) => { approveComputerAction(id); refresh(); };
  const handleDeny = (id: string) => { denyComputerAction(id); refresh(); };

  return (
    <div className="h-full overflow-y-auto p-5 space-y-5">
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Computer Use Control</h2>
      <Chip tone="amber">Experimental</Chip>
      <p className="text-sm text-slate-500 dark:text-slate-400">Permission-gated computer actions. All shell, click, type, and screenshot operations require explicit approval.</p>

      <Card variant="accent">
        <CardHeader title="Request Action" subtitle="All actions require approval before execution" />
        <div className="flex flex-wrap gap-2 mb-3">
          {ACTIONS.map((a) => (
            <button key={a} className={`${action === a ? buttonClass : ghostButtonClass} text-xs capitalize`} onClick={() => setAction(a)}>{a}</button>
          ))}
        </div>
        <input className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm mb-3" placeholder="Reason for this action" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className={buttonClass} onClick={handleRequest} disabled={!reason.trim()}>Request {action}</button>
      </Card>

      {requests.length === 0 ? (
        <EmptyState title="No computer use requests" description="Submit a request above to begin." />
      ) : (
        requests.map((req) => (
          <Card key={req.id}>
            <CardHeader
              title={`${req.action.toUpperCase()}${req.reason ? ` — ${req.reason}` : ""}`}
              subtitle={new Date(req.createdAt).toLocaleTimeString()}
              action={<Chip tone={req.status === "approved" ? "green" : req.status === "denied" ? "red" : req.status === "executed" ? "blue" : "amber"}>{req.status}</Chip>}
            />
            {req.status === "pending" && (
              <div className="flex gap-2">
                <button className={buttonClass} onClick={() => handleApprove(req.id)}>Approve</button>
                <button className={ghostButtonClass} onClick={() => handleDeny(req.id)}>Deny</button>
              </div>
            )}
            {req.status === "executed" && req.result && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{req.result}</p>
            )}
          </Card>
        ))
      )}
    </div>
  );
}