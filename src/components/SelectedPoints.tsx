import { MAX_POINTS, type MapPoint } from "@/types/ranking";

export default function SelectedPoints({
  points,
  onRemove,
  onClear,
  disabled = false,
}: {
  points: MapPoint[];
  onRemove: (id: string) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  return (
    <section className="points-section" aria-labelledby="points-heading">
      <div className="section-heading">
        <div>
          <h2 id="points-heading">Pontos selecionados</h2>
          <p>Latitude e longitude de cada localização.</p>
        </div>
        <button
          className="text-button"
          type="button"
          disabled={disabled || !points.length}
          onClick={onClear}
        >
          Limpar todos
        </button>
      </div>
      <ol className="point-list">
        {Array.from({ length: MAX_POINTS }, (_, index) => {
          const point = points[index];
          return (
            <li
              key={point?.id ?? `empty-${index}`}
              className={point ? "point-row" : "point-row empty"}
            >
              <span className="point-number">{index + 1}</span>
              <div className="point-info">
                <strong>Ponto {index + 1}</strong>
                <span className="coordinates">
                  {point
                    ? `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`
                    : "Clique no mapa para selecionar"}
                </span>
              </div>
              {point ? (
                <button
                  type="button"
                  className="remove-point"
                  disabled={disabled}
                  aria-label={`Remover ponto ${index + 1}`}
                  onClick={() => onRemove(point.id)}
                >
                  ×
                </button>
              ) : (
                <span className="empty-dash">—</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
