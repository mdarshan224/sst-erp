"use client";
import type { Row } from "@/components/campus/context";
import { Button } from "@/components/campus/ui";
export function AdmitCard({
  card,
  onClose,
}: {
  card: Row;
  onClose: () => void;
}) {
  return (
    <>
      <div className="admit-actions">
        <Button onClick={() => window.print()}>Print / Save as PDF</Button>
        <Button variant="outline" onClick={onClose}>
          Close admit card
        </Button>
      </div>
      <article className="admit-card" aria-label="Examination admit card">
        <header>
          <small>EXAMINATION ADMIT CARD</small>
          <h1>{card.institution.name}</h1>
          <p>{card.institution.address}</p>
          <span>
            {card.year} · {card.board}
          </span>
        </header>
        <section className="admit-identity">
          <div>
            <h2>{card.exam}</h2>
            <dl>
              <dt>Student</dt>
              <dd>{card.student.name}</dd>
              <dt>Admission no.</dt>
              <dd>{card.student.admissionNumber}</dd>
              <dt>Class / section</dt>
              <dd>
                {card.className} / {card.section}
              </dd>
              <dt>Card number</dt>
              <dd>{card.cardNumber}</dd>
            </dl>
          </div>
          {card.student.photoUrl ? (
            <img src={card.student.photoUrl} alt="Student photograph" />
          ) : (
            <div className="admit-photo">
              Student
              <br />
              photograph
            </div>
          )}
        </section>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Subject / assessment</th>
              <th>Date</th>
              <th>Time (IST)</th>
              <th>Room</th>
            </tr>
          </thead>
          <tbody>
            {card.subjects.map((s: Row) => (
              <tr key={s.id}>
                <td>{s.code}</td>
                <td>
                  {s.name}
                  <small>{s.assessment}</small>
                </td>
                <td>{s.exam_date || "Activity assessment"}</td>
                <td>
                  {s.start_time
                    ? `${s.start_time} – ${s.end_time}`
                    : "As instructed"}
                </td>
                <td>{s.room || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <section className="admit-footer">
          <div>
            <h3>Instructions</h3>
            <ol>
              <li>Carry this admit card and institution identity card.</li>
              <li>Report 30 minutes before the scheduled examination.</li>
              <li>Follow the institution’s examination rules.</li>
            </ol>
            <div className="admit-signatures">
              <span>Student signature</span>
              <span>Authorized signature / seal</span>
            </div>
          </div>
          <div>
            <img src={card.qrDataUrl} alt="Scan to verify this admit card" />
            <p>Scan to verify · erp.sohansoft.in</p>
          </div>
        </section>
        <footer>
          Issued by {card.institution.name} · Sohan Soft Tech · Valid until{" "}
          {card.expiresAt.slice(0, 10)}
        </footer>
      </article>
    </>
  );
}
