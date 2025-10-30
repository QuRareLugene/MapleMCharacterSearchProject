import * as utils from "../utils.js";

function renderUnion(S) {
  const un = S.union?.data;
  const unRaider = S.union_raider?.data;
  const unionSec = utils.$("#union");

  if (un) {
    unionSec.classList.remove("hidden");

    const unionInfoEl = utils.$("#union-info");
    unionInfoEl.innerHTML = "";
    unionInfoEl.className = "stats-grid";

    const mkUnionStat = (name, val) => {
      const box = utils.elt("div", "stat");
      box.append(utils.elt("div", "k", name));
      box.append(utils.elt("div", "v", val ?? "-"));
      return box;
    };

    unionInfoEl.append(mkUnionStat("레벨", un.union_level));
    unionInfoEl.append(mkUnionStat("등급", un.union_grade));

    const raidersEl = utils.$("#union-raiders");
    raidersEl.innerHTML = "";
    const effectsEl = utils.$("#union-effects");
    effectsEl.innerHTML = "";
    const mapEl = utils.$("#union-map-wrap");
    mapEl.innerHTML = "";
    const mapTitle = utils.$("#union-map-title");

    if (unRaider) {
      (unRaider.use_union_raider_option || []).forEach((e) => {
        const card = utils.elt("div", "mini-card");
        card.append(
          utils.elt("div", "skill-name", `${e.option_name}: ${e.option_value}`)
        );
        raidersEl.append(card);
      });

      (unRaider.use_union_occupied_option || []).forEach((e) => {
        const card = utils.elt("div", "mini-card");
        card.append(
          utils.elt("div", "skill-name", `${e.option_name}: ${e.option_value}`)
        );
        effectsEl.append(card);
      });

      const activePresetNo = unRaider.use_preset_no || 1;
      const battleMapPresets = unRaider.battle_map || [];
      const activePreset = battleMapPresets.find(
        (p) => p.preset_no == activePresetNo
      );

      if (activePreset) {
        if (mapTitle) {
          mapTitle.textContent = `전투 지도 (프리셋 ${activePresetNo} 사용 중)`;
        }

        if (activePreset.option_setting) {
          const areaWrap = utils.$("#union-area-effects-wrap");
          areaWrap.innerHTML = "";
          const areaTitle = utils.h4("지도 구역 효과");
          const areaEffectsEl = utils.elt("div", "grid-4");
          for (let i = 1; i <= 8; i++) {
            const opt = activePreset.option_setting[`option_name_${i}`];
            if (opt) {
              const card = utils.elt("div", "mini-card");
              card.append(utils.elt("div", "skill-name", `구역 ${i}: ${opt}`));
              areaEffectsEl.append(card);
            }
          }
          areaWrap.append(areaTitle, areaEffectsEl);
        }

        if (activePreset.union_raider) {
          const map = utils.elt("div", "union-map");
          const placed = new Set();

          (activePreset.union_raider || []).forEach((block) => {
            (block.block_position || []).forEach((pos) => {
              if (pos.cell_x != null && pos.cell_y != null) {
                const cell = utils.elt("div", "union-map-block");
                cell.classList.add(`union-block-type-${block.block_type || "0"}`);
                cell.classList.add(`union-block-rank-${block.block_rank || "0"}`);
                cell.style.gridRow = `${parseInt(pos.cell_y, 10) + 1}`;
                cell.style.gridColumn = `${parseInt(pos.cell_x, 10) + 1}`;
                map.append(cell);
                placed.add(`${pos.cell_x}:${pos.cell_y}`);
              }
            });
          });

          for (let r = 0; r < 20; r++) {
            for (let c = 0; c < 22; c++) {
              if (!placed.has(`${c}:${r}`)) {
                const cell = utils.elt("div", "union-map-cell");
                cell.style.gridRow = `${r + 1}`;
                cell.style.gridColumn = `${c + 1}`;
                map.append(cell);
              }
            }
          }
          mapEl.append(map);
        }
      }
    }
  } else {
    unionSec.classList.add("hidden");
  }
}

export { renderUnion };
