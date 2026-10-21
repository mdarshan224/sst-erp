// Isolated UI fixtures only. Generated preview assets are removed before packaging.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { AppContext, AppState } from "../components/campus/context";
import { PlatformContext } from "../features/platform/context";
import { StudentForm } from "../features/students/StudentForm";
import { StructureForm } from "../features/fees/StructureForm";
import { InstitutionDeletion } from "../features/platform/Governance";
import { Users } from "../features/auth/Users";
import { InstitutionDetail } from "../features/platform/InstitutionDetail";
import Holidays from "../features/platform/Holidays";
const institution = {
  id: "ui-school",
  name: "A Very Long Institution Name for Responsive Layout Verification",
  institution_code: "UI-TEST",
  institution_type: "School",
  status: "Active",
  created_at: "2026-10-01T00:00:00Z",
  settings: {},
};
const base = {
  years: [
    {
      id: "year",
      name: "2026–27",
      start_date: "2026-06-01",
      end_date: "2027-05-31",
    },
  ],
  classes: [{ id: "class", name: "Class 10" }],
  sections: [
    {
      id: "section",
      name: "A",
      class_name: "Class 10",
      academic_year_id: "year",
      class_id: "class",
    },
  ],
  streams: [],
  components: [{ id: "component", name: "Tuition", active: true }],
  user: { id: "staff", userId: "staff", email: "ui@example.test" },
  institution,
};
function Harness() {
  const [view, setView] = useState("student"),
    [open, setOpen] = useState(true),
    [revision, setRevision] = useState(0);
  const request = React.useCallback(
    async (path: string, options?: { method?: string }) => {
      if (path.endsWith("/deletion/challenge"))
        return {
          challengeId: "ui-only",
          mobile: "******0000",
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          resendAt: new Date(Date.now() + 60000).toISOString(),
        };
      if (path.endsWith("/deletion"))
        return {
          institution,
          job: null,
          inventory: {
            policy:
              "UI test fixture: no SMS is sent and no institution can be deleted.",
            entries: [],
          },
        };
      if (path === "institutions/ui-school")
        return {
          institution,
          subscription: { modules: [], student_limit: 100, user_limit: 10 },
          usage: { students: 1, users: 1 },
          domains: {
            defaultPortal: "/campus/ui-school",
            portalUrl: "/campus/ui-school",
            portalPath: "/campus/ui-school",
          },
          admins: [],
          pendingAdmins: [],
        };
      if (path === "plans") return { rows: [] };
      if (path.startsWith("holidays")) return { rows: [], total: 0 };
      if (path.startsWith("institutions")) return { rows: [] };
      if (path === "users")
        return {
          members: [
            {
              id: "faculty1",
              user_id: "faculty1",
              name: "Faculty Member With A Long Name",
              email: "long.faculty.address@example.test",
              role: "TEACHER",
              section_id: "section",
              mobile: null,
              active: 1,
              permissions: "[]",
            },
          ],
          invitations: [],
        };
      if (options?.method)
        throw new Error(
          "UI fixture: mutations are tested in the integration suite.",
        );
      return { rows: [] };
    },
    [],
  );
  const value = {
    boot: base,
    scope: { year: "year" },
    request,
    revision,
    refresh: () => setRevision((v) => v + 1),
    can: () => true,
    query: () => "",
    institutionId: "ui-school",
    basePath: "/campus/ui-school",
    t: (v: string) => v,
  } as unknown as AppState;
  return (
    <>
      <aside
        style={{
          padding: 16,
          background: "#fff4ce",
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <strong>ISOLATED UI TEST — no live data</strong>
        {[
          "student",
          "schedule",
          "deletion",
          "faculty",
          "institution",
          "holidays",
        ].map((v) => (
          <button
            key={v}
            onClick={() => {
              setView(v);
              setOpen(true);
            }}
          >
            {v}
          </button>
        ))}
        <button onClick={() => setOpen(true)}>Reopen form</button>
      </aside>
      <AppContext.Provider value={value}>
        <PlatformContext.Provider
          value={{
            user: base.user,
            primary: true,
            can: () => true,
            request: request as AppState["request"],
            revision,
            refresh: value.refresh,
          }}
        >
          <main
            className="platform-shell"
            style={{ padding: 24, display: "block" }}
          >
            <div className="workspace-route">
              {view === "student" ? (
                <StudentForm open={open} onClose={() => setOpen(false)} />
              ) : view === "schedule" ? (
                <StructureForm open={open} onClose={() => setOpen(false)} />
              ) : view === "deletion" ? (
                <InstitutionDeletion key={revision} id="ui-school" />
              ) : view === "faculty" ? (
                <Users />
              ) : view === "institution" ? (
                <InstitutionDetail id="ui-school" />
              ) : (
                <Holidays />
              )}
            </div>
          </main>
        </PlatformContext.Provider>
      </AppContext.Provider>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
