import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { workflowFixture } from '../test-fixtures';
import { RouteMap } from './RouteMap';

let preferenceListener: (() => void) | undefined;
let reducedMotion = false;
let visibilityListener: IntersectionObserverCallback | undefined;

beforeEach(() => {
  reducedMotion = false;
  preferenceListener = undefined;
  visibilityListener = undefined;
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return reducedMotion;
      },
      addEventListener: (_event: string, listener: () => void) => {
        preferenceListener = listener;
      },
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        visibilityListener = callback;
      }
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('geographic European route map', () => {
  it('renders real country geometry with honest illustrative location descriptions', () => {
    const { container } = render(<RouteMap workflow={null} />);
    expect(container.querySelectorAll('[data-country]').length).toBeGreaterThan(25);
    expect(container.querySelector('[data-country="FR"]')).toHaveClass('map-country-market');
    expect(screen.getByRole('img')).toHaveAccessibleDescription(/Natural Earth.*Mercator/);
    expect(screen.getByRole('img')).toHaveAccessibleDescription(/pas des sites logistiques réels/);
    expect(container.querySelectorAll('.map-route-selected')).toHaveLength(0);
    expect(container.querySelector('.map-incident')).toBeNull();
  });

  it.each(['Belgique', 'Belgium', 'BE', 'belgique'])(
    'highlights the Belgian option for %s',
    (source) => {
      const { container } = render(
        <RouteMap
          workflow={workflowFixture}
          scenario={{ ...workflowFixture.scenarios[0], source_country: source }}
        />,
      );
      expect(container.querySelector('[data-country="BE"]')).toHaveClass('map-country-selected');
      expect(container.querySelector('[data-route="belgium"]')).toHaveAttribute(
        'data-selected',
        'true',
      );
      expect(screen.getByText('Option de sourcing · non exécutée')).toBeVisible();
    },
  );

  it('updates the sourcing path when switching scenarios', () => {
    const { container, rerender } = render(
      <RouteMap workflow={workflowFixture} scenario={workflowFixture.scenarios[0]} />,
    );
    rerender(
      <RouteMap
        workflow={workflowFixture}
        scenario={{ ...workflowFixture.scenarios[0], source_country: 'Espagne' }}
      />,
    );
    expect(container.querySelector('[data-route="spain"]')).toHaveAttribute(
      'data-selected',
      'true',
    );
    expect(container.querySelector('[data-country="ES"]')).toHaveClass('map-country-selected');
    expect(container.querySelector('[data-country="BE"]')).not.toHaveClass('map-country-selected');
  });

  it('does not invent a sourcing route for an unsupported source', () => {
    const { container } = render(
      <RouteMap
        workflow={workflowFixture}
        scenario={{ ...workflowFixture.scenarios[0], source_country: 'France' }}
      />,
    );
    expect(container.querySelectorAll('.map-route-selected')).toHaveLength(0);
    expect(container.querySelectorAll('.map-country-selected')).toHaveLength(0);
  });

  it('shows the executed transfer source rather than a different selected scenario', () => {
    const { container } = render(
      <RouteMap
        workflow={{
          ...workflowFixture,
          status: 'completed',
          transfer: {
            id: 'test-transfer',
            quantity: 4000,
            source_country: 'Belgique',
            destination_country: 'France',
            idempotency_key: 'test-key',
          },
        }}
        scenario={{ ...workflowFixture.scenarios[0], source_country: 'Espagne' }}
      />,
    );
    expect(container.querySelector('[data-route="belgium"]')).toHaveAttribute(
      'data-selected',
      'true',
    );
    expect(screen.getByText('Transfert simulé créé')).toBeVisible();
    expect(container.querySelector('.map-incident')).toBeNull();
  });

  it('provides a keyboard-operable motion pause and resume control', () => {
    const { container } = render(<RouteMap workflow={workflowFixture} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause des animations' }));
    expect(container.querySelector('.route-card')).toHaveAttribute('data-motion', 'disabled');
    expect(screen.getByRole('button', { name: 'Animer les flux' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Animer les flux' }));
    expect(container.querySelector('.route-card')).toHaveAttribute('data-motion', 'enabled');
  });

  it('respects reduced motion and updates when the system preference changes', () => {
    reducedMotion = true;
    const { container } = render(<RouteMap workflow={workflowFixture} />);
    expect(screen.getByRole('button', { name: 'Mouvement réduit' })).toBeDisabled();
    expect(container.querySelector('.route-card')).toHaveAttribute('data-motion', 'disabled');
    act(() => {
      reducedMotion = false;
      preferenceListener?.();
    });
    expect(screen.getByRole('button', { name: 'Pause des animations' })).toBeEnabled();
  });

  it('pauses offscreen loops and resumes only when visible', () => {
    const { container } = render(<RouteMap workflow={workflowFixture} />);
    act(() =>
      visibilityListener?.(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    expect(container.querySelector('.route-card')).toHaveAttribute('data-motion-running', 'false');
    act(() =>
      visibilityListener?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    expect(container.querySelector('.route-card')).toHaveAttribute('data-motion-running', 'true');
  });

  it('pauses loops while the document is hidden', () => {
    const { container } = render(<RouteMap workflow={workflowFixture} />);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(container.querySelector('.route-card')).toHaveAttribute('data-motion-running', 'false');
    hidden.mockReturnValue(false);
    fireEvent(document, new Event('visibilitychange'));
    expect(container.querySelector('.route-card')).toHaveAttribute('data-motion-running', 'true');
  });

  it('uses unique accessible SVG references for multiple maps', () => {
    render(
      <>
        <RouteMap workflow={null} />
        <RouteMap workflow={null} />
      </>,
    );
    const images = screen.getAllByRole('img');
    expect(images[0].getAttribute('aria-labelledby')).not.toBe(
      images[1].getAttribute('aria-labelledby'),
    );
  });
});
