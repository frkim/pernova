import { useEffect, useId, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import PauseRounded from '@mui/icons-material/PauseRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import PublicRounded from '@mui/icons-material/PublicRounded';
import type { Scenario, Workflow } from '../types';
import { number } from '../logic';
import { SectionHeading } from './Common';
import {
  EUROPE_COUNTRIES,
  MAP_HEIGHT,
  MAP_HUBS,
  MAP_WIDTH,
  projectLocation,
} from './europe-map-data';

function routePath(from: { x: number; y: number }, to: { x: number; y: number }, bend: number) {
  return `M${from.x},${from.y} Q${(from.x + to.x) / 2 + bend},${(from.y + to.y) / 2} ${to.x},${to.y}`;
}

const countryLabels = [
  { name: 'ALLEMAGNE', longitude: 12.5, latitude: 50 },
  { name: 'ITALIE', longitude: 12.5, latitude: 43 },
  { name: 'PORTUGAL', longitude: -8.5, latitude: 38 },
  { name: 'ROYAUME-UNI', longitude: -3, latitude: 55.5 },
];

export function RouteMap({
  workflow,
  scenario,
}: {
  workflow: Workflow | null;
  scenario?: Scenario;
}) {
  const id = useId();
  const cardRef = useRef<HTMLElement>(null);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [inViewport, setInViewport] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(media.matches);
    const updateVisibility = () => setVisible(!document.hidden);
    updatePreference();
    updateVisibility();
    media.addEventListener('change', updatePreference);
    document.addEventListener('visibilitychange', updateVisibility);
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => setInViewport(entry.isIntersecting));
    if (cardRef.current) observer?.observe(cardRef.current);
    return () => {
      media.removeEventListener('change', updatePreference);
      document.removeEventListener('visibilitychange', updateVisibility);
      observer?.disconnect();
    };
  }, []);

  const source = workflow?.transfer?.source_country ?? scenario?.source_country;
  const sourceLower = source?.toLowerCase();
  const selectedHub =
    sourceLower && ['belgium', 'belgique', 'be'].includes(sourceLower)
      ? 'belgium'
      : sourceLower && ['spain', 'espagne', 'es'].includes(sourceLower)
        ? 'spain'
        : undefined;
  const activeSourceId = selectedHub === 'belgium' ? 'BE' : selectedHub === 'spain' ? 'ES' : '';
  const motionEnabled = !paused && !reducedMotion;
  const france = MAP_HUBS.france;
  const port = MAP_HUBS.port;
  const disrupted = workflow && !workflow.transfer;
  const delayPath = routePath(port, france, 85);
  const status = workflow?.transfer
    ? 'Transfert simulé créé'
    : selectedHub
      ? 'Option de sourcing · non exécutée'
      : 'Réseau indicatif · données synthétiques';

  return (
    <section
      ref={cardRef}
      className="surface route-card"
      aria-label="Visualisation des routes européennes"
      data-motion={motionEnabled ? 'enabled' : 'disabled'}
      data-motion-running={motionEnabled && visible && inViewport}
    >
      <SectionHeading
        eyebrow="EUROPE · RÉSEAU DE DISTRIBUTION"
        title="Une perturbation. Plusieurs chemins."
        aside={<Chip size="small" icon={<PublicRounded />} label="Routes indicatives" />}
      />
      <div className="route-visual">
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          role="img"
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-description`}
        >
          <title id={`${id}-title`}>Réseau logistique européen Pernova</title>
          <desc id={`${id}-description`}>
            Carte géographique de l’Europe, contours Natural Earth en projection Mercator. Paris,
            Bruxelles, Madrid et Rotterdam sont des repères illustratifs, pas des sites logistiques
            réels. Les routes représentent des options synthétiques, pas un suivi en temps réel.
            {workflow
              ? ` Marché exposé : ${workflow.incident.market}. Retard : ${workflow.incident.delay_days} jours.`
              : ' Lancez une analyse pour visualiser le marché exposé.'}
            {source ? ` Option sélectionnée depuis ${source}.` : ''}
          </desc>
          <defs>
            <pattern id={`${id}-grid`} width="44" height="44" patternUnits="userSpaceOnUse">
              <path d="M44 0H0V44" fill="none" className="map-grid-line" />
            </pattern>
            <marker
              id={`${id}-arrow`}
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M0 0L6 3L0 6Z" className="map-route-arrow" />
            </marker>
          </defs>
          <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill={`url(#${id}-grid)`} />
          <g className="map-countries">
            {EUROPE_COUNTRIES.map((country) => (
              <path
                key={country.id}
                d={country.path}
                data-country={country.id}
                className={
                  country.id === 'FR'
                    ? 'map-country map-country-market'
                    : country.id === activeSourceId
                      ? 'map-country map-country-selected'
                      : 'map-country'
                }
              >
                <title>{country.name}</title>
              </path>
            ))}
          </g>
          <g className="map-labels map-context-labels">
            {countryLabels.map(({ name, longitude, latitude }) => {
              const { x, y } = projectLocation(longitude, latitude);
              return (
                <text key={name} x={x} y={y} textAnchor="middle">
                  {name}
                </text>
              );
            })}
            <text x="347" y="275" textAnchor="middle" className="sea-label">
              OCÉAN ATLANTIQUE
            </text>
            <text x="682" y="447" textAnchor="middle" className="sea-label">
              MÉDITERRANÉE
            </text>
          </g>
          <g fill="none" strokeLinecap="round">
            {(['belgium', 'spain'] as const).map((hub) => {
              const path = routePath(MAP_HUBS[hub], france, hub === 'belgium' ? -30 : -65);
              const selected = selectedHub === hub;
              return (
                <g key={hub} data-route={hub} data-selected={selected}>
                  <path d={path} className="map-route-track" />
                  {selected && (
                    <g key={`${workflow?.id ?? 'preview'}-${hub}`}>
                      <path
                        d={path}
                        pathLength="1"
                        className="map-route-selected"
                        markerEnd={`url(#${id}-arrow)`}
                      />
                      {[0, 1, 2].map((index) => (
                        <circle
                          key={index}
                          r="3.2"
                          className={`map-route-particle map-route-particle-${index}`}
                          style={{ offsetPath: `path("${path}")` }}
                        />
                      ))}
                    </g>
                  )}
                </g>
              );
            })}
            {disrupted && <path d={delayPath} className="map-route-delayed" />}
          </g>
          <g className="map-hubs">
            {(['france', 'belgium', 'spain'] as const).map((hub) => {
              const { x, y } = MAP_HUBS[hub];
              return (
                <g key={hub} data-hub={hub}>
                  <circle
                    cx={x}
                    cy={y}
                    r={hub === 'france' ? 13 : 10}
                    className={hub === 'france' ? 'map-hub-halo market' : 'map-hub-halo'}
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r="5"
                    className={hub === 'france' ? 'map-hub market' : 'map-hub'}
                  />
                  <g className="map-labels map-hub-label">
                    <text x={x + 15} y={y + (hub === 'belgium' ? -2 : 4)}>
                      {hub === 'france' ? 'FRANCE' : hub === 'belgium' ? 'BELGIQUE' : 'ESPAGNE'}
                    </text>
                    <text
                      x={x + 15}
                      y={y + (hub === 'belgium' ? 12 : 18)}
                      className="map-city-label"
                    >
                      {hub === 'france' ? 'Paris' : hub === 'belgium' ? 'Bruxelles' : 'Madrid'}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
          {disrupted && (
            <g className="map-incident">
              <circle cx={port.x} cy={port.y} r="17" className="map-incident-pulse" />
              <circle cx={port.x} cy={port.y} r="9" className="map-incident-marker" />
              <text x={port.x} y={port.y + 4} textAnchor="middle" className="map-incident-symbol">
                !
              </text>
              <path
                d={`M${port.x},${port.y - 12} V${port.y - 43} H${port.x + 24}`}
                className="map-incident-leader"
              />
              <rect x={port.x + 24} y={port.y - 62} width="172" height="40" rx="6" />
              <text x={port.x + 36} y={port.y - 45} className="map-incident-title">
                Retard · +{workflow.incident.delay_days} jours
              </text>
              <text x={port.x + 36} y={port.y - 31} className="map-city-label">
                Port illustratif · Rotterdam
              </text>
            </g>
          )}
          <g className="map-compass" transform="translate(858 38)" aria-hidden="true">
            <text textAnchor="middle" y="-10">
              N
            </text>
            <path d="M0 0L-4 15L0 12L4 15Z" />
          </g>
        </svg>
        <div className="map-summary">
          <span className="map-shipment">
            {workflow ? workflow.incident.shipment_id : 'Réseau européen'}
          </span>
          <strong>
            {workflow
              ? `${number(workflow.incident.quantity)} unités exposées`
              : 'Voir plus loin. Agir plus juste.'}
          </strong>
          <span>
            {workflow ? workflow.incident.product : 'Une vue partagée de l’incident à l’exécution.'}
          </span>
          <span className="map-route-status" key={status}>
            {status}
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
        <Button
          className="map-motion-toggle"
          size="small"
          startIcon={paused || reducedMotion ? <PlayArrowRounded /> : <PauseRounded />}
          onClick={() => setPaused((value) => !value)}
          aria-pressed={paused}
          disabled={reducedMotion}
        >
          {reducedMotion ? 'Mouvement réduit' : paused ? 'Animer les flux' : 'Pause des animations'}
        </Button>
      </div>
      <p className="map-attribution">
        Fond Natural Earth · Repères et flux illustratifs · Aucun suivi logistique réel
      </p>
    </section>
  );
}
