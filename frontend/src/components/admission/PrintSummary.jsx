import { JLMCLogo } from '../JLMCLogo';
import { formatDateTime, nightsText, peso } from '../../lib/admission';

function Line({ label, value }) {
  if (!value) return null;
  return (
    <p className="text-[13px] leading-snug">
      <span className="font-semibold">{label}: </span>
      <span className="whitespace-pre-line">{value}</span>
    </p>
  );
}

function Section({ title, children }) {
  return (
    <section className="mt-5 break-inside-avoid">
      <h2 className="text-sm font-bold uppercase tracking-wider border-b border-black pb-1 mb-2">{title}</h2>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

// Shown only when printing. Plain black and white so it copies well.
export function PrintSummary({ detail, labelFor }) {
  const { admission: a, record, delivery, items, grandTotal, bed, packages = [], philhealthTotal, discharge, referral, followups } = detail;
  const medicareLabel = { sss: 'SSS', gsis: 'GSIS', owwa: 'OWWA', indigent: 'Indigent', others: `Others${a.medicare_other ? `: ${a.medicare_other}` : ''}` }[a.medicare];
  const resultsText = (discharge?.results || []).map((c) => (detail.dischargeResults || []).find((r) => r.code === c)?.label || c).join(', ');
  const vitals = [a.bp && `BP ${a.bp}`, a.pulse && `Pulse ${a.pulse}`, a.resp_rate && `Resp ${a.resp_rate}`, a.temperature && `Temp ${a.temperature}°C`].filter(Boolean).join('   ');
  const risks = (a.risk_flags || []).map((c) => labelFor('risk_flag', c)).join(', ');

  return (
    <div className="hidden print:block text-black bg-white p-2">
      <header className="flex items-center gap-3 border-b-2 border-black pb-3">
        <JLMCLogo size={52} />
        <div>
          <p className="text-lg font-bold leading-tight">Jean Lying-in Maternity Clinic</p>
          <p className="text-xs">Admission and Discharge Summary</p>
        </div>
      </header>

      <Section title="Patient">
        <Line label="Name" value={`${a.first_name} ${a.last_name}`} />
        <Line label="Birth date / Age" value={record?.birth_date ? `${new Date(record.birth_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}${record.age ? `, ${record.age} years old` : ''}` : (a.age ? `${a.age} years old` : null)} />
        <Line label="Address" value={record?.address} />
        <Line label="Tel. no." value={record?.contact_number} />
        <Line label="Civil status / Nationality / Religion" value={[record?.civil_status, record?.nationality, record?.religion].filter(Boolean).join(' / ') || null} />
        <Line label="Birthplace" value={record?.birthplace} />
        <Line label="Occupation" value={record?.occupation} />
        <Line label="Employer" value={[record?.employer, record?.employer_address, record?.employer_tel].filter(Boolean).join(' - ') || null} />
        <Line label="PhilHealth PIN" value={record?.philhealth_pin} />
        <Line label="Allergic to" value={record?.allergies} />
        <Line label="Father's name" value={[record?.father_name, record?.father_address, record?.father_tel].filter(Boolean).join(' - ') || null} />
        <Line label="Bed" value={a.bed_number ? `${detail.wardName || 'Ward'}, Bed ${a.bed_number}` : null} />
        <Line label="Admitted" value={formatDateTime(a.admitted_at)} />
        <Line label="Admitted by" value={a.admitted_by_name} />
      </Section>

      <Section title="On admission">
        <Line label="Reason for coming in" value={a.chief_complaint} />
        <Line label="Admitting diagnosis" value={a.admitting_diagnosis} />
        <Line label="Check-up on arrival" value={vitals} />
        <Line label="Labor notes" value={a.labor_notes} />
        <Line label="Warning signs" value={risks} />
        <Line label="Informed consent" value={a.consent_signed ? `Signed${a.consent_by ? ` by ${a.consent_by}` : ''}` : 'Not recorded'} />
        <Line label="Referred by" value={a.referred_by} />
        <Line label="Social service classification" value={a.social_service_class} />
        <Line label="Hospitalization plan" value={a.hospitalization_plan} />
        <Line label="Health insurance" value={a.health_insurance_name} />
        <Line label="Medicare" value={medicareLabel} />
        <Line label="ICD code" value={a.icd_code} />
        <Line label="Data furnished by" value={[a.informant_name, a.informant_relationship, a.informant_address].filter(Boolean).join(' - ') || null} />
      </Section>

      {delivery && (
        <Section title="Delivery">
          <Line label="Born" value={formatDateTime(delivery.delivered_at)} />
          <Line label="Type" value={labelFor('delivery_type', delivery.delivery_type)} />
          <Line label="Attended by" value={delivery.attendant} />
          <Line label="Problems" value={delivery.complications} />
          {delivery.newborns?.map((b, i) => (
            <Line
              key={b.id || i}
              label={delivery.newborns.length > 1 ? `Baby ${i + 1}` : 'Baby'}
              value={[b.sex === 'Female' ? 'Girl' : b.sex === 'Male' ? 'Boy' : b.sex, b.weight_grams && `${b.weight_grams} g`, b.apgar_1 !== null && b.apgar_1 !== undefined && `Score ${b.apgar_1}/${b.apgar_5 ?? '-'}`].filter(Boolean).join(', ')}
            />
          ))}
        </Section>
      )}

      {(items.length > 0 || bed?.amount > 0) && (
        <Section title="Charges">
          <table className="w-full text-[13px]">
            <tbody>
              {bed?.amount > 0 && (
                <tr className="border-b border-gray-300">
                  <td className="py-1">Bed {bed.number} × {nightsText(bed.nights)} ({peso(bed.pricePerNight)} per night)</td>
                  <td className="py-1 text-right">{peso(bed.amount)}</td>
                </tr>
              )}
              {items.map((it) => (
                <tr key={it.id} className="border-b border-gray-300">
                  <td className="py-1">{it.label} × {Number(it.quantity)}</td>
                  <td className="py-1 text-right">{peso(Number(it.unit_price) * Number(it.quantity))}</td>
                </tr>
              ))}
              <tr>
                <td className="pt-2 font-bold">Total to pay</td>
                <td className="pt-2 text-right font-bold">{peso(grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </Section>
      )}

      {packages.length > 0 && (
        <Section title="PhilHealth packages (not charged at the clinic)">
          {packages.map((p) => <Line key={p.code} label={p.label} value={peso(p.amount)} />)}
          <Line label="PhilHealth total" value={peso(philhealthTotal)} />
        </Section>
      )}

      {discharge && (
        <Section title="Discharge">
          <Line label="Discharged" value={formatDateTime(discharge.discharged_at)} />
          <Line label="Reason" value={labelFor('discharge_reason', discharge.disposition)} />
          <Line label="Final diagnosis" value={discharge.final_diagnosis} />
          <Line label="Results" value={resultsText || null} />
          <Line label="Instructions" value={discharge.instructions} />
          {followups.length > 0 && <Line label="Follow-up visits" value={followups.map((f) => new Date(f.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })).join('   ')} />}
        </Section>
      )}

      {referral && (
        <Section title="Referral">
          <Line label="Sent to" value={referral.facility} />
          <Line label="Reason" value={referral.reason} />
          <Line label="Transport" value={referral.transport} />
        </Section>
      )}

      <div className="mt-12 grid grid-cols-2 gap-10 text-xs break-inside-avoid">
        <div className="border-t border-black pt-1 text-center">Attending midwife / doctor</div>
        <div className="border-t border-black pt-1 text-center">Patient or guardian</div>
      </div>
    </div>
  );
}
