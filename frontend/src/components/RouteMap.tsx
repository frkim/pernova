import Chip from '@mui/material/Chip';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import PublicRounded from '@mui/icons-material/PublicRounded';
import type { Scenario, Workflow } from '../types';
import { number } from '../logic';
import { SectionHeading } from './Common';

export function RouteMap({
  workflow,
  scenario,
}: {
  workflow: Workflow | null;
  scenario?: Scenario;
}) {
  const source = scenario?.source_country ?? workflow?.transfer?.source_country;
  const sourceLower = source?.toLowerCase();
  const belgium = sourceLower === 'belgium' || sourceLower === 'belgique' || sourceLower === 'be';
  const spain = sourceLower === 'spain' || sourceLower === 'espagne' || sourceLower === 'es';
  return (
    <section className="surface route-card" aria-label="Visualisation des routes européennes">
      <SectionHeading
        eyebrow="EUROPE · RÉSEAU DE DISTRIBUTION"
        title="Une perturbation. Plusieurs chemins."
        aside={<Chip size="small" icon={<PublicRounded />} label="Routes indicatives" />}
      />
      <div className="route-visual">
        <svg viewBox="0 0 760 350" role="img" aria-labelledby="route-title route-description">
          <title id="route-title">Réseau logistique européen Pernova</title>
          <desc id="route-description">
            Carte schématique de France, Belgique et Espagne.
            {workflow
              ? ` Marché exposé : ${workflow.incident.market}. Retard : ${workflow.incident.delay_days} jours.`
              : ' Lancez une analyse pour visualiser le marché exposé.'}
            {source ? ` Option sélectionnée depuis ${source}.` : ''}
          </desc>
          <defs>
            <pattern id="map-grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M30 0H0V30" fill="none" stroke="#d9e3ee" strokeWidth=".6" />
            </pattern>
            <linearGradient id="map-land" x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#f8fbff" />
              <stop offset="1" stopColor="#e5edf7" />
            </linearGradient>
            <linearGradient id="route-gradient">
              <stop stopColor="#9372f3" />
              <stop offset="1" stopColor="#209cb8" />
            </linearGradient>
            <radialGradient id="hub-glow">
              <stop stopColor="#8871f5" stopOpacity=".22" />
              <stop offset="1" stopColor="#8871f5" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="760" height="350" fill="url(#map-grid)" opacity=".55" />
          <g fill="url(#map-land)" stroke="#bccde1" strokeWidth="1.2" strokeLinejoin="round">
            <path d="M350 25l20-15 22 10 1 26-21 21-16 36-18-9-7-23 7-26z" />
            <path d="M301 54l20-8 10 30-8 33-22 8-7-20z" />
            <path d="M387 102l15-22 19 8 8 26-5 15-27 4z" />
            <path d="M387 133l23-4 20 15-5 19-30 4-17-17z" />
            <path d="M287 145l38-2 18-15 35 18 21 24 29-3 16 39-29 27-13 26-55 7-25-24-11-32-26-5-28-23 3-24z" />
            <path d="M271 255l46-17 29 27 54-7-4 35-29 33-72 0-36-21z" />
            <path d="M254 266l17-11-12 50-11 13-6-22z" />
            <path d="M432 115l33-22 37 17 12 46-16 40-45 12-25-41z" />
            <path d="M433 211l20-3 11 19-19 11-21-7z" />
            <path d="M465 224l17 2 8 26 20 15 14 41-10 11-28-24-7-30-21-21z" />
            <path d="M508 195l49-4 22 22-16 24-65 2-18-19z" />
            <path d="M520 82l44-8 27 16 11 33-23 65-65-28z" />
            <path d="M473 8l19 5-12 38-23 19-12-18z" />
            <path d="M494 13l41-9 17 32-21 38-25 2-8-23z" />
            <path d="M569 5l50 0 17 29-19 46-26 10-27-17 10-38z" />
            <path d="M605 131l60-21 57 27 20 65-67 37-94-27-19-26z" />
          </g>
          <g className="map-labels">
            <text x="476" y="147">
              ALLEMAGNE
            </text>
            <text x="508" y="284">
              ITALIE
            </text>
            <text x="177" y="128" className="sea-label">
              OCÉAN
            </text>
            <text x="167" y="147" className="sea-label">
              ATLANTIQUE
            </text>
            <text x="522" y="340" className="sea-label">
              MÉDITERRANÉE
            </text>
          </g>
          <circle cx="365" cy="194" r="75" fill="url(#hub-glow)" />
          <g fill="none" strokeWidth="3" strokeLinecap="round">
            <path
              d="M398 149Q354 143 365 194"
              stroke={belgium ? 'url(#route-gradient)' : '#b9c8dc'}
              strokeDasharray={belgium ? undefined : '5 7'}
            />
            <path
              d="M326 290Q286 224 365 194"
              stroke={spain ? 'url(#route-gradient)' : '#b9c8dc'}
              strokeDasharray={spain ? undefined : '5 7'}
            />
            {workflow && (
              <path d="M405 97Q465 128 365 194" stroke="#d89861" strokeDasharray="4 7" />
            )}
          </g>
          <g>
            <circle cx="365" cy="194" r="15" fill="#6952d8" fillOpacity=".15" />
            <circle cx="365" cy="194" r="7" fill="#6952d8" stroke="white" strokeWidth="3" />
            <circle cx="398" cy="149" r="6" fill="#15958f" stroke="white" strokeWidth="3" />
            <circle cx="326" cy="290" r="6" fill="#15958f" stroke="white" strokeWidth="3" />
          </g>
          <g className="map-labels">
            <text x="377" y="207">
              FRANCE
            </text>
            <text x="411" y="146">
              BELGIQUE
            </text>
            <text x="338" y="303">
              ESPAGNE
            </text>
          </g>
          {workflow && (
            <g>
              <circle cx="405" cy="97" r="10" fill="#fff4e8" stroke="#cb8648" />
              <text x="402" y="102" fontSize="14" fill="#996016" fontWeight="bold">
                !
              </text>
              <rect x="423" y="55" width="158" height="33" rx="10" fill="white" stroke="#edcdae" />
              <text x="438" y="77" fill="#986022" fontSize="12" fontWeight="600">
                Retard · +{workflow.incident.delay_days} jours
              </text>
            </g>
          )}
        </svg>
        <div className="map-summary">
          <span className="eyebrow">
            {workflow ? workflow.incident.shipment_id : 'VOTRE PROCHAINE DÉCISION'}
          </span>
          <strong>
            {workflow
              ? `${number(workflow.incident.quantity)} unités exposées`
              : 'Voir plus loin. Agir plus juste.'}
          </strong>
          <span>
            {workflow ? workflow.incident.product : 'Une vue partagée de l’incident à l’exécution.'}
          </span>
        </div>
      </div>
      <div className="map-footer">
        <span>
          <i className="legend-dot purple" /> Marché exposé
        </span>
        <span>
          <i className="legend-dot teal" /> Options de sourcing
        </span>
        {source && (
          <strong>
            {source} <ArrowForwardRounded fontSize="small" />{' '}
            {workflow?.incident.market ?? 'France'}
          </strong>
        )}
      </div>
    </section>
  );
}
