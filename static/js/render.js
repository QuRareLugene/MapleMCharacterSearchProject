/* =========================================================================
 * Maple M Viewer — Rendering Logic
 * ========================================================================= */

import * as utils from './utils.js';
import { renderUnion } from './render/union.js';

function parseEffectValue(value) {
  const num = parseFloat(String(value).replace(/,/g, ''));
  const unit = String(value).replace(/[\d.,\s]/g, '');
  return { num: isNaN(num) ? 0 : num, unit };
}

function parseSkillNameAndLevel(name) {
  if (!name) return { name: '-', level: null };
  const match = name.match(/Lv\.(\d+)\s+(.+)/);
  if (match) {
    return { name: match[2], level: parseInt(match[1], 10) };
  }
  return { name: name, level: null };
}

function renderOptionLines(stack, values) {
  const lines = new Array(3).fill("-");
  values.forEach((val, i) => {
    if (i < 3 && val) lines[i] = val;
  });
  lines.forEach(line => stack.append(utils.elt("div", "option-line", line)));
}

function renderLinkSkills(S) {
  const linkPresets = S.link_skill?.data?.link_skill || [];
  const usePreset = S.link_skill?.data?.use_prest_no;
  const linkUseEl = utils.$("#link-use");
  linkUseEl.textContent = "";
  const linkList = utils.$("#link-list");
  linkList.innerHTML = "";
  if (linkPresets.length) {
    utils.$("#links").classList.remove("hidden");
    linkUseEl.textContent =
      usePreset != null ? `활성 프리셋: ${usePreset}` : "";
    linkPresets
      .sort((a, b) => a.preset_no - b.preset_no)
      .forEach((p) => {
        const pc = utils.elt(
          "div",
          `preset-card ${p.preset_no === usePreset ? "active" : "inactive"}`
        );
        pc.append(utils.h4(`프리셋 ${p.preset_no}`));
        const arr = p.link_skill_info || [];

        const mergedSkills = new Map();
        // console.log(`[프리셋 ${p.preset_no}] 스킬 합산 시작`);
        arr.forEach((ls) => {
          const name = ls.skill_name || "-";
          // console.log(`처리 중인 스킬: ${name}`, ls);

          if (mergedSkills.has(name)) {
            const existing = mergedSkills.get(name);
            // console.log(`'${name}'은(는) 이미 존재합니다. 합산을 시작합니다.`, '기존:', existing);

            existing.skill_level += ls.skill_level || 0;

            const existingEffects = utils.parseEffectString(
              existing.skill_effect
            );
            const newEffects = utils.parseEffectString(ls.skill_effect);
            
            // console.log('기존 효과:', existingEffects, '새 효과:', newEffects);

            for (const [key, { num, unit }] of newEffects.entries()) {
              if (existingEffects.has(key)) {
                const oldEffect = existingEffects.get(key);
                if (
                  typeof oldEffect.num === "number" &&
                  typeof num === "number"
                ) {
                  // console.log(`'${key}' 효과 값 합산: ${oldEffect.num} + ${num} = ${oldEffect.num + num}`);
                  oldEffect.num += num;
                }
              } else {
                // console.log(`'${key}' 효과 새로 추가:`, { num, unit });
                existingEffects.set(key, { num, unit });
              }
            }
            existing.skill_effect = utils.formatEffectString(existingEffects);
            // console.log(`'${name}' 합산 완료:`, existing);
          } else {
            const newEntry = JSON.parse(JSON.stringify(ls));
            newEntry.skill_effect = utils.formatEffectString(utils.parseEffectString(newEntry.skill_effect));
            mergedSkills.set(name, newEntry);
            // console.log(`'${name}'을(를) 새로 추가했습니다.`, newEntry);
          }
        });
        // console.log(`[프리셋 ${p.preset_no}] 스킬 합산 완료`, mergedSkills);

        const grid = utils.elt("div", "grid-2");
        if (mergedSkills.size > 0) {
          Array.from(mergedSkills.values()).forEach((ls) => {
            grid.append(createLinkSkillCard(ls));
          });
          pc.append(grid);
        } else {
          pc.append(utils.emptyCard("링크 스킬 없음"));
        }
        
        linkList.append(pc);
      });
  } else {
    utils.$("#links").classList.remove("hidden");
    linkList.append(utils.emptyCard("링크 스킬 없음"));
  }
}

function createLinkSkillCard(ls) {
  const cell = utils.elt("div", "mini-card link-card");
  const ic = utils.safeImg(ls.skill_icon, ls.skill_name, 28);
  if (ic) {
    cell.classList.add("with-icon");
    cell.prepend(ic);
  }
  const meta = utils.elt("div", "link-meta");
  meta.append(utils.elt("div", "skill-name", ls.skill_name || "-"));
  if (ls.skill_level != null) {
    meta.append(utils.elt("div", "skill-level", `Lv. ${ls.skill_level}`));
  }
  if (ls.skill_effect) {
    const st = utils.elt("div", "chip-stack stacked");
    const effects = utils.parseEffectString(ls.skill_effect);

    effects.forEach((value, key) => {
      const text = utils.formatEffectString(new Map([[key, value]]));
      st.append(utils.chipRow(utils.chip(text)));
    });
    meta.append(st);
  }
  cell.append(meta);
  return cell;
}

/* ---------- 메인 렌더 ---------- */
function renderAll(data, worldLabel) {
  try {
    const S = {
      basic: { data: data.basic },
      stat: { data: data.stat },
      hyper_stat: { data: data.hyper_stat },
      item_equipment: { data: data.item_equipment },
      set_effect: { data: data.set_effect },
      symbol: { data: data.symbol },
      android_equipment: { data: data.android_equipment },
      jewel: { data: data.jewel },
      pet_equipment: { data: data.pet_equipment },
      skill_equipment: { data: data.skill_equipment },
      link_skill: { data: data.link_skill },
      vmatrix: { data: data.vmatrix },
      union: { data: data.union },
      union_raider: { data: data.union_raider },
      guild: { data: data.guild },
      hexamatrix_skill: { data: data.hexamatrix_skill },
      hexamatrix_stat: { data: data.hexamatrix_stat },
    };

    /* 기본 정보 */
    const b = S.basic?.data || {};
    utils.$("#basic").classList.remove("hidden");
    const avatar = utils.$("#char-img");
    const repl =
      utils.safeImg(b.character_image, "character", 120, "avatar") ||
      Object.assign(document.createElement("div"), { className: "avatar" });
    avatar.replaceWith(repl);
    repl.id = "char-img";
    utils.$("#name").textContent = b.character_name || "-";
    utils.$("#job").textContent = b.character_job_name || b.character_class || "-";
    utils.$("#world-label").textContent = worldLabel || b.world_name || "-";
    utils.$("#level").textContent = b.character_level ?? "-";
    const guildName = b.character_guild_name || "";
    utils.$("#guild").textContent = guildName ? `길드: ${guildName}` : "";

    const times = [];
    if (b.character_date_create)
      times.push("생성: " + b.character_date_create);
    if (b.character_date_last_login)
      times.push("최근 접속: " + b.character_date_last_login);
    if (b.character_date_last_logout)
      times.push("최근 로그아웃: " + b.character_date_last_logout);
    utils.$("#times").innerHTML = times.join("<br>");

    /* 스탯 */
    const statArr = S.stat?.data?.stat || S.stat?.data?.final_stat || [];
    const smap = new Map(statArr.map((s) => [s.stat_name, s.stat_value]));
    const sg = utils.$("#stats-grid");
    sg.innerHTML = "";
    sg.className = "stats-grid profile";
    const statsToFormat = new Set([
      "전투력",
      "HP",
      "MP",
      "물리 공격력",
      "마법 공격력",
      "물리 방어력",
      "마법 방어력",
    ]);
    const mk = (name, val, cls = "") => {
      const box = utils.elt("div", `stat ${cls}`);
      box.append(utils.elt("div", "k", name));
      const vtxt = statsToFormat.has(name) ? utils.toManNotation(val) : val ?? "-";
      box.append(utils.elt("div", "v", vtxt));
      return box;
    };
    sg.append(mk("전투력", smap.get("전투력"), "full"));
    sg.append(mk("HP", smap.get("HP")));
    sg.append(mk("MP", smap.get("MP")));
    sg.append(mk("물리 공격력", smap.get("물리 공격력")));
    sg.append(mk("마법 공격력", smap.get("마법 공격력")));
    sg.append(mk("물리 방어력", smap.get("물리 방어력")));
    sg.append(mk("마법 방어력", smap.get("마법 방어력")));

    /* 심볼 */
    const sy = S.symbol?.data || {};
    const listSy = utils.$("#symbol-list");
    listSy.innerHTML = "";
    const arcanes = sy.arcane_symbol || [];
    const auths = sy.authentic_symbol || [];
    const symbolsSec = utils.$("#symbols");
    if (arcanes.length || auths.length) {
      symbolsSec.classList.remove("hidden");
      listSy.className = "symbol-groups";
      const stripPrefix = (name) =>
        String(name || "")
          .replace(
            /^\s*(아케인\s*심볼|아케인심볼|어센틱\s*심볼|어센틱심볼)\s*:\s*/i,
            ""
          )
          .trim();
      const mkGroup = (title, arr, kind) => {
        const wrap = document.createElement("li");
        const t = utils.elt("div", "symbol-group-title", title);
        const grid = utils.elt("div", "symbol-grid");
        if (!arr.length) grid.append(utils.emptyCard("없음"));
        arr.forEach((sym) => {
          const card = utils.elt("div", "symbol-card has-topchip");
          card.append(utils.chip(kind, "mini top-left"));
          const icon = utils.safeImg(sym.symbol_icon, sym.symbol_name, 56);
          if (icon) card.append(icon);
          else card.append(utils.elt("div"));
          const meta = document.createElement("div");
          const region = stripPrefix(sym.symbol_name || "-");
          meta.append(utils.elt("div", "symbol-name", `${kind} : ${region}`));
          if (sym.symbol_level != null) {
            meta.append(
              utils.elt("div", "symbol-level", `Lv. ${sym.symbol_level}`)
            );
          }
          const chips = [];
          utils.effectTextToChips(sym.symbol_option).forEach((c) => chips.push(c));
          utils.chipStack(meta, chips, "stacked");
          card.append(meta);
          grid.append(card);
        });
        wrap.append(t, grid);
        return wrap;
      };
      listSy.append(
        mkGroup("아케인 심볼", arcanes, "아케인심볼"),
        mkGroup("어센틱 심볼", auths, "어센틱심볼")
      );
    } else symbolsSec.classList.add("hidden");

    /* 장비 */
    const eqList = S.item_equipment?.data?.item_equipment || [];
    const equipWrap = utils.$("#equip-wrap");
    equipWrap.innerHTML = "";
    const slotMap = {};
    for (const it of eqList) {
      const key = utils.normalizeSlot(
        it.item_equipment_slot_name || it.item_equipment_page_name
      );
      if (key && !slotMap[key]) slotMap[key] = it;
    }
    const hadOnePiece = !!slotMap["한벌옷"];
    if (hadOnePiece) {
      slotMap["상의"] = slotMap["한벌옷"];
      slotMap.__onePiece = true;
      delete slotMap["한벌옷"];
    }

    function buildEquipCard(slotLabel, item, noteWhenEmpty = "장비 없음") {
      const gradeName = item?.item_grade || "";
      const borderCls = utils.GRADE_BORDER_CLASS[gradeName] || "grade-border-normal";
      const card = utils.elt("div", "equip" + (item ? ` ${borderCls}` : " empty"));
      card.classList.add("has-topchip");
      if (slotLabel) card.append(utils.chip(slotLabel, "mini top-left"));

      if (item && item.item_icon) {
        const img = utils.safeImg(item.item_icon, item.item_name, 56);
        if (img) card.append(img);
        else card.append(utils.elt("div"));
      } else {
        card.append(utils.elt("div"));
      }

      const body = document.createElement("div");
      if (item) {
        body.append(utils.elt("div", "name", item.item_name || "-"));

        const gradeChip = item.item_grade
          ? utils.chip(item.item_grade, utils.GRADE_CHIP_CLASS[item.item_grade] || "")
          : null;
        if (gradeChip) body.append(utils.chipRow(gradeChip));
        if (item.starforce_upgrade)
          body.append(utils.chipRow(utils.chip(`${item.starforce_upgrade}★`)));
        if (item.equipment_level != null)
          body.append(utils.chipRow(utils.chip(`Lv. ${item.equipment_level}`)));
        const trans = utils.normalizeAbilityFlag(
          item.transmission_able,
          "전승 가능",
          "전승 불가"
        );
        const todd = utils.normalizeAbilityFlag(
          item.todd_able,
          "전수 가능",
          "전수 불가"
        );
        if (trans || todd)
          body.append(utils.chipRow(trans ? utils.chip(trans) : null, todd ? utils.chip(todd) : null));

        body.append(utils.elt("hr", "divider"));

        const mainOpts = utils.effectTextToChips(item.item_option);
        if (mainOpts.length) {
          body.append(
            utils.chipSection("장비의 주옵션", (stack) => {
              mainOpts.forEach((o) =>
                stack.append(utils.elt("div", "option-line", o))
              );
            })
          );
        }

        const totalOpts = item.item_total_option || {};
        const totalOptChips = [];
        for (const key in totalOpts) {
          if (key.endsWith("_rate")) continue; 
          const val = totalOpts[key];
          if (val && val !== "0") {
            totalOptChips.push(utils.chip(`${key}: +${val}`));
          }
        }
        if (totalOptChips.length > 0) {
          body.append(
            utils.chipSection("총 옵션", (stack) => {
              totalOptChips.forEach((c) => stack.append(utils.chipRow(c)));
            })
          );
        }

        if (!utils.isAccessorySlot(slotLabel)) {
          const potVals = (item.item_potential_option || []).map((p) =>
            p?.option_name
              ? `${p.option_name} ${p.option_value ?? ""}`.trim()
              : null
          );
          body.append(
            utils.chipSection("잠재능력", (stack) => renderOptionLines(stack, potVals))
          );

          const addVals = (item.item_additional_potential_option || []).map(
            (p) =>
              p?.option_name
                ? `${p.option_name} ${p.option_value ?? ""}`.trim()
                : null
          );
          body.append(
            utils.chipSection("애디셔널", (stack) => renderOptionLines(stack, addVals))
          );
        }

        if (item.soul_equipment_flag === "1" && item.soul_info) {
          const soul = document.createElement("div");
          soul.className = "soul";
          soul.append(
            utils.elt("div", "soul-title", item.soul_info.soul_name || "소울")
          );
          const eff = (item.soul_info.soul_option || "").trim();
          if (eff) soul.append(utils.elt("div", "soul-opt", eff));
          body.append(soul);
        }

        if (item.item_shape_icon) {
          const shape = utils.elt("div", "item-shape");
          const shapeIcon = utils.safeImg(
            item.item_shape_icon,
            item.item_shape_name,
            32
          );
          if (shapeIcon) shape.append(shapeIcon);
          shape.append(utils.elt("div", "name", item.item_shape_name || "외형 정보"));
          body.append(utils.chipSection("적용된 외형", (_) => body.append(shape)));
        }
      } else {
        body.append(utils.elt("div", "slot-label", slotLabel));
        body.append(utils.elt("div", "note", noteWhenEmpty));
      }
      card.append(body);
      return card;
    }
    function groupBlock(title) {
      const wrap = utils.elt("div", "equip-group");
      wrap.append(utils.h4(title));
      return wrap;
    }

    utils.$("#equip").classList.remove("hidden");
    { const wrap=groupBlock("무기"); const grid=utils.elt("div","equip-grid");
      ["무기","보조무기","엠블렘"].forEach(s=>grid.append(buildEquipCard(s, slotMap[s])));
      wrap.append(grid); equipWrap.append(wrap); }
    { const wrap=groupBlock("주 방어구"); const grid=utils.elt("div","equip-grid");
      grid.append(buildEquipCard("모자", slotMap["모자"]));
      grid.append(buildEquipCard("상의", slotMap["상의"]));
      if (slotMap.__onePiece) grid.append(buildEquipCard("하의 (한벌옷)", null, "(한벌옷)"));
      else grid.append(buildEquipCard("하의", slotMap["하의"]));
      wrap.append(grid); equipWrap.append(wrap); }
    { const wrap=groupBlock("보조 방어구"); const g3=utils.elt("div","row-grid-3 equal");
      g3.append(buildEquipCard("장갑",slotMap["장갑"]));
      g3.append(buildEquipCard("신발",slotMap["신발"]));
      g3.append(buildEquipCard("",null,"없음"));
      g3.append(buildEquipCard("어깨",slotMap["어깨"]));
      g3.append(buildEquipCard("망토",slotMap["망토"]));
      g3.append(buildEquipCard("벨트",slotMap["벨트"]));
      wrap.append(g3); equipWrap.append(wrap); }
    { const wrap=groupBlock("주 장신구");
      const r1=utils.elt("div","row-grid-2 equal"); ["반지 1","반지 2"].forEach(s=>r1.append(buildEquipCard(s,slotMap[s])));
      const r2=utils.elt("div","row-grid-2 equal"); ["반지 3","반지 4"].forEach(s=>r2.append(buildEquipCard(s,slotMap[s])));
      const r3=utils.elt("div","row-grid-2 equal"); ["목걸이 1","목걸이 2"].forEach(s=>r3.append(buildEquipCard(s,slotMap[s])));
      const r4=utils.elt("div","row-grid-2 equal"); r4.append(buildEquipCard("귀걸이 1", slotMap["귀걸이 1"])); r4.append(buildEquipCard("",null,"없음"));
      const r5=utils.elt("div","row-grid-2 equal"); ["얼굴장식","눈장식"].forEach(s=>r5.append(buildEquipCard(s,slotMap[s])));
      wrap.append(r1,r2,r3,utils.elt("div","block-gap"),r4,utils.elt("div","block-gap"),r5); equipWrap.append(wrap); }
    { const wrap=groupBlock("보조 장신구");
      const r1=utils.elt("div","row-grid-2 equal"); ["훈장","칭호"].forEach(s=>r1.append(buildEquipCard(s,slotMap[s])));
      const r2=utils.elt("div","row-grid-2 equal"); ["뱃지","포켓"].forEach(s=>r2.append(buildEquipCard(s,slotMap[s])));
      wrap.append(r1,r2); equipWrap.append(wrap); }


    /* 세트 효과 (2단 카드) */
    const sets = S.set_effect?.data?.set_info || [];
    const setEl = utils.$("#set-list");
    setEl.innerHTML = "";
    if (sets.length) {
      utils.$("#sets").classList.remove("hidden");
      for (const s of sets) {
        const li = document.createElement("li");
        const card = utils.elt("div", "set-card");
        card.append(utils.elt("div", "set-title", `${s.set_name} (${s.set_count}셋)`));
        const stack = utils.elt("div", "chip-stack stacked");
        utils.setEffectToChips(String(s.set_option || "")).forEach((l) =>
          stack.append(utils.chipRow(utils.chip(l)))
        );
        card.append(stack);
        li.append(card);
        setEl.append(li);
      }
    }

    /* 쥬얼 */
    const jw = S.jewel?.data || {};
    const jewelSec = utils.$("#jewel");
    const gridJ = utils.$("#jewel-grid");
    gridJ.innerHTML = "";
    if (jw?.jewel_equipment?.length) {
      jewelSec.classList.remove("hidden");
      const active = Number(jw.use_jewel_page_no);
      jw.jewel_equipment
        .sort((a, b) => (a.jewel_page_no ?? 0) - (b.jewel_page_no ?? 0))
        .forEach((pg) => {
          const pageNo = pg.jewel_page_no ?? "-";
          const page = utils.elt(
            "div",
            `jewel-page has-topchip ${pageNo === active ? "active" : "inactive"}`
          );
          page.append(utils.chip(`쥬얼 페이지 ${pageNo}`, "mini top-left"));
          const head = utils.elt("div", "header");
          head.append(
            utils.elt("div", "muted small", pageNo === active ? "사용 중" : "비활성")
          );
          page.append(head);

          const pageOpt = pg.jewel_page_option || pg.jewel_page_effect || "";
          const pageChips = utils.effectTextToChips(pageOpt);
          if (pageChips.length) utils.chipStack(page, pageChips, "stacked");

          const five = utils.elt("div", "jewel-five");
          const gems = pg.jewel_info || [];
          if (!gems.length) five.append(utils.emptyCard("젬 없음"));
          gems.forEach((j) => {
            const card =
              utils.elt(
                "div",
                "jewel-card " +
                  (j.jewel_grade
                    ? `grade-${String(j.jewel_grade).toUpperCase()}`
                    : "")
              );
            const icon = utils.safeImg(j.jewel_icon, j.jewel_name, 48, "jewel-icon");
            const meta = document.createElement("div");
            meta.className = "jewel-meta";
            meta.append(utils.elt("span", "name", j.jewel_name || "-"));
            const opt = j.jewel_option || "";
            if (opt) {
              const st = utils.elt("div", "chip-stack stacked");
              utils.effectTextToChips(opt).forEach((o) =>
                st.append(utils.chipRow(utils.chip(o)))
              );
              meta.append(st);
            }
            if (icon) card.append(icon);
            card.append(meta);
            five.append(card);
          });
          page.append(five);
          gridJ.append(page);
        });
    } else {
      jewelSec.classList.remove("hidden");
      gridJ.append(utils.emptyCard("쥬얼 정보 없음"));
    }

    /* 안드로이드/하트/캐시장비 — 통합 카드 */
    const adAll = S.android_equipment?.data || {};
    const ad = adAll.android_equipment || {};
    const heart = adAll.heart_equipment || {};
    const pet = S.pet_equipment?.data || {};

    const androidSec = utils.$("#android");
    androidSec.classList.remove("hidden");
    const adWrap = utils.$("#android-wrap");
    adWrap.innerHTML = "";
    const heartWrap = utils.$("#heart-wrap");
    heartWrap.innerHTML = "";
    const petWrap = utils.$("#pet-wrap");
    petWrap.innerHTML = "";

    const androidCard = utils.elt("div", "subcard android-card has-topchip");
    androidCard.append(utils.chip("안드로이드", "mini top-left"));

    const headBox = utils.elt("div", "android-head");
    if (Object.keys(ad).length) {
      const adIcon = utils.safeImg(ad.android_icon, ad.android_name, 56, "icon-56");
      if (adIcon) headBox.append(adIcon);
      const meta = utils.elt("div", "android-meta");
      meta.append(
        utils.elt("div", "title-lg", `${ad.android_name || "-"} (${ad.android_grade || "-"})`)
      );
      const tags = [];
      if (ad.android_non_humanoid_flag === "1") tags.push("비인간형");
      tags.push(
        `창고${ad.android_warehouse_usable_flag === "1" ? " 사용가능" : " 사용불가"}`
      );
      if (tags.length) meta.append(utils.elt("div", "kvline", tags.join(" · ")));
      headBox.append(meta);
    } else headBox.append(utils.elt("div", "muted", "안드로이드 없음"));
    androidCard.append(headBox);

    const cashList = ad.android_cash_item_equipment || [];
    const cashBox = utils.elt("div", "android-section");
    cashBox.append(utils.elt("div", "chip-title", "캐시 장비"));
    if (cashList.length) {
      const grid = utils.elt("div", "mini-grid");
      cashList.forEach((ci) => {
        const c = utils.elt("div", "mini-card with-icon has-topchip");
        c.append(utils.chip("캐시", "mini top-left"));
        const icon = utils.safeImg(ci.cash_item_icon, ci.cash_item_name, 28);
        if (icon) c.append(icon);
        const meta = utils.elt("div", "mini-meta");
        meta.append(utils.elt("div", "skill-name", ci.cash_item_name || "-"));
        const sub = [];
        if (ci.cash_item_equipment_page_name)
          sub.push(ci.cash_item_equipment_page_name);
        if (ci.cash_item_equipment_slot_name)
          sub.push(ci.cash_item_equipment_slot_name);
        if (sub.length) meta.append(utils.elt("div", "mini-sub", sub.join(" · ")));
        c.append(meta);
        grid.append(c);
      });
      cashBox.append(grid);
    } else {
      cashBox.append(utils.emptyCard("캐시 장비 없음"));
    }
    androidCard.append(cashBox);

    const heartBox = utils.elt("div", "android-section");
    heartBox.append(utils.elt("div", "chip-title", "하트"));
    if (Object.keys(heart).length) {
      const row = utils.elt("div", "heart-row");
      const hIcon = utils.safeImg(heart.heart_icon, heart.heart_name, 40, "icon-40");
      if (hIcon) row.append(hIcon);
      const hm = utils.elt("div", "heart-meta");
      hm.append(utils.elt("div", "title-lg", heart.heart_name || "-"));
      const topChips = [];
      if (heart.item_grade)
        topChips.push(
          utils.chip(heart.item_grade, utils.GRADE_CHIP_CLASS[heart.item_grade] || "")
        );
      if (heart.starforce_upgrade)
        topChips.push(utils.chip(`${heart.starforce_upgrade}★`));
      if (heart.equipment_level != null)
        topChips.push(utils.chip(`Lv. ${heart.equipment_level}`));
      if (topChips.length) hm.append(utils.chipRow(...topChips));

      const main = utils.effectTextToChips(
        heart.item_option || heart.heart_option
      );
      if (main.length)
        hm.append(
          utils.chipSection("옵션", (st) =>
            main.forEach((o) => st.append(utils.chipRow(utils.chip(o))))
          )
        );

      const potVals = (heart.item_potential_option || [])
        .map((p) =>
          p?.option_name ? `${p.option_name} ${p.option_value ?? ""}`.trim() : null
        )
        .filter(Boolean);
      const addVals = (heart.item_additional_potential_option || [])
        .map((p) =>
          p?.option_name ? `${p.option_name} ${p.option_value ?? ""}`.trim() : null
        )
        .filter(Boolean);
      if (potVals.length)
        hm.append(
          utils.chipSection("잠재능력", (st) =>
            potVals.forEach((v) => st.append(utils.chipRow(utils.chip(v))))
          )
        );
      if (addVals.length)
        hm.append(
          utils.chipSection("애디셔널", (st) =>
            addVals.forEach((v) => st.append(utils.chipRow(utils.chip(v))))
          )
        );

      row.append(hm);
      heartBox.append(row);
    } else heartBox.append(utils.emptyCard("하트 없음"));
    androidCard.append(heartBox);

    adWrap.append(androidCard);

    const petCard = utils.elt("div", "subcard");
    petCard.append(utils.h4("펫"));

    const petsData = [];
    if (pet) {
      for (let i = 1; i <= 3; i++) {
        const petName = pet[`pet_${i}_name`];
        if (petName) {
          petsData.push({
            pet_name: petName,
            pet_type: pet[`pet_${i}_pet_type`],
            pet_date_expire: pet[`pet_${i}_date_expire`],
            pet_icon: pet[`pet_${i}_icon`],
            pet_skill: pet[`pet_${i}_skill`],
            pet_item_equipment: pet[`pet_${i}_item_equipment`],
          });
        }
      }
    }

    if (petsData.length > 0) {
      const pRows = utils.elt("div", "row-grid-3 equal");
      petsData.forEach((p, i) => {
        const c = utils.elt("div", "mini-card has-topchip pet-card");
        c.append(utils.chip(`펫 ${i + 1}`, "mini top-left"));

        const petIcon = utils.safeImg(p.pet_icon, p.pet_name, 48);
        if (petIcon) c.append(petIcon);

        c.append(utils.elt("div", "pet-name", p.pet_name || "없음"));
        if (p.pet_name) {
          c.append(utils.petTypeChip(p.pet_type));
          if (p.pet_date_expire) {
            const date = new Date(p.pet_date_expire).toLocaleDateString();
            c.append(utils.elt("div", "pet-expire", `만료: ${date}`));
          }
          if (p.pet_skill) {
            const skillChips = p.pet_skill.map((skill) => utils.chip(skill));
            c.append(
              utils.chipSection("펫 스킬", (stack) =>
                skillChips.forEach((ch) => stack.append(utils.chipRow(ch)))
              )
            );
          }
          if (p.pet_item_equipment) {
            const equip = p.pet_item_equipment;
            const equipSection = utils.elt("div", "pet-equip-section");
            const equipIcon = utils.safeImg(equip.item_icon, equip.item_name, 24);
            const equipMeta = utils.elt("div", "pet-equip-meta");
            equipMeta.append(utils.elt("div", "name", equip.item_name));
            const equipChips = utils.effectTextToChips(equip.item_option);
            if (equipChips.length) {
              const stack = utils.elt("div", "chip-stack");
              equipChips.forEach((ec) => stack.append(utils.chipRow(utils.chip(ec))));
              equipMeta.append(stack);
            }
            if (equipIcon) equipSection.append(equipIcon);
            equipSection.append(equipMeta);
            c.append(utils.chipSection("펫 장비", (_) => c.append(equipSection)));
          }
        }
        pRows.append(c);
      });
      petCard.append(pRows);
    } else {
      petCard.append(utils.emptyCard("펫 정보 없음"));
    }
    petWrap.append(petCard);

    /* 스킬 장착 (기존) */
    const eqSkills = S.skill_equipment?.data?.skill?.equipment_skill || [];
    const skillPresets = S.skill_equipment?.data?.skill?.preset || [];
    const stealSkills = S.skill_equipment?.data?.skill?.steal_skill || [];
    const stellaSkills = S.skill_equipment?.data?.skill?.stella_memorize || [];

    const skList = utils.$("#skill-list");
    skList.innerHTML = "";
    const presetDiv = utils.$("#skill-presets");
    presetDiv.textContent = "";
    if (eqSkills.length) {
      utils.$("#skills").classList.remove("hidden");
      const bySet = new Map();
      eqSkills.forEach((s) => {
        const k = s.equipment_skill_set ?? 0;
        if (!bySet.has(k)) bySet.set(k, []);
        bySet.get(k).push(s);
      });
      presetDiv.textContent = `사용 세트: ${[...bySet.keys()]
        .sort((a, b) => a - b)
        .join(", ")}`;
      [...bySet.entries()]
        .sort((a, b) => a[0] - b[0])
        .forEach(([setNo, items]) => {
          const card = utils.elt("div", "skill-set");
          card.append(utils.h4(`세트 ${setNo}`));
          const grid = utils.elt("div", "skill-grid");
          items.forEach((s) => {
            const { name, level } = parseSkillNameAndLevel(s.skill_name);
            const mc = utils.elt("div", "skill-card");
            const icon = utils.safeImg(s.skill_icon, name, 32);
            if (icon) {
              mc.classList.add("with-icon");
              mc.prepend(icon);
            }
            const meta = utils.elt("div", "skill-meta");
            meta.append(utils.elt("div", "skill-name", name));
            if (level != null) {
              meta.append(utils.elt("div", "skill-level", `Lv. ${level}`));
            }
            if (s.skill_grade) {
              meta.append(
                utils.chip(s.skill_grade, `grade-chip-${s.skill_grade.toLowerCase()}`)
              );
            }
            mc.append(meta);
            grid.append(mc);
          });
          card.append(grid);
          skList.append(card);
        });
    } else {
      utils.$("#skills").classList.remove("hidden");
      skList.append(utils.emptyCard("스킬 장착 없음"));
    }

    /* 스킬 프리셋 */
    const presetsSection = utils.$("#skill_presets_section");
    const presetsList = utils.$("#skill_presets_list");
    presetsList.innerHTML = "";

    if (skillPresets.length) {
      presetsSection.classList.remove("hidden");

      skillPresets
        .sort((a, b) => a.preset_slot_no - b.preset_slot_no)
        .forEach((p) => {
          const presetContainer = utils.elt("div", "skill-preset-group");
          presetContainer.append(utils.h4(`${p.preset_slot_no}번 스킬 프리셋`));

          const grid = utils.elt("div", "skill-preset-grid");
          const skills = [
            { name: p.skill_name_1, icon: p.skill_icon_1 },
            { name: p.skill_name_2, icon: p.skill_icon_2 },
            { name: p.skill_name_3, icon: p.skill_icon_3 },
            { name: p.skill_name_4, icon: p.skill_icon_4 },
          ];

          skills.forEach((skill) => {
            if (skill.name) {
              const { name, level } = parseSkillNameAndLevel(skill.name);
              const mc = utils.elt("div", "skill-card with-icon");
              const iconEl = utils.safeImg(skill.icon, name, 32);
              if (iconEl) mc.prepend(iconEl);

              const meta = utils.elt("div", "skill-meta");
              meta.append(utils.elt("div", "skill-name", name));
              if (level != null) {
                meta.append(utils.elt("div", "skill-level", `Lv. ${level}`));
              }
              mc.append(meta);
              grid.append(mc);
            } else {
              const emptySlot = utils.elt(
                "div",
                "skill-card empty-slot",
                "비어있음"
              );
              grid.append(emptySlot);
            }
          });
          presetContainer.append(grid);
          presetsList.append(presetContainer);
        });
    } else {
      presetsSection.classList.add("hidden");
    }

    /* 보조 스킬 (스틸, 스텔라) */
    const subSkillsSection = utils.$("#sub-skills");
    const subSkillsList = utils.$("#sub-skills-list");
    subSkillsList.innerHTML = "";
    if (stealSkills.length > 0 || stellaSkills.length > 0) {
      subSkillsSection.classList.remove("hidden");

      if (stealSkills.length > 0) {
        subSkillsList.append(utils.h4("스틸 스킬"));
        const grid = utils.elt("div", "skill-grid");
        stealSkills.forEach((s) => {
          const { name, level } = parseSkillNameAndLevel(s.skill_name);
          const mc = utils.elt("div", "skill-card");
          const icon = utils.safeImg(s.skill_icon, name, 32);
          if (icon) {
            mc.classList.add("with-icon");
            mc.prepend(icon);
          }
          const meta = utils.elt("div", "skill-meta");
          meta.append(utils.elt("div", "skill-name", name));
          if (level != null) {
            meta.append(utils.elt("div", "skill-level", `Lv. ${level}`));
          }
          mc.append(meta);
          grid.append(mc);
        });
        subSkillsList.append(grid);
      }

      if (stellaSkills.length > 0) {
        subSkillsList.append(utils.h4("스텔라 메모라이즈"));
        const grid = utils.elt("div", "skill-grid");
        stellaSkills.forEach((s) => {
          const { name, level } = parseSkillNameAndLevel(s.skill_name);
          const mc = utils.elt("div", "skill-card");
          const icon = utils.safeImg(s.skill_icon, name, 32);
          if (icon) {
            mc.classList.add("with-icon");
            mc.prepend(icon);
          }
          const meta = utils.elt("div", "skill-meta");
          meta.append(utils.elt("div", "skill-name", name));
          if (level != null) {
            meta.append(utils.elt("div", "skill-level", `Lv. ${level}`));
          }
          mc.append(meta);
          grid.append(mc);
        });
        subSkillsList.append(grid);
      }
    } else {
      subSkillsSection.classList.add("hidden");
    }

    renderLinkSkills(S);

    /* V 매트릭스 */
    const vcores = S.vmatrix?.data?.character_v_core_equipment || [];
    const vList = utils.$("#v-list");
    vList.innerHTML = "";
    if (vcores.length) {
      utils.$("#vmatrix").classList.remove("hidden");

      const coreGroups = { enhancement: [], skill: [], special: [] };
      const typeMap = {
        enhancement: "강화 코어",
        skill: "스킬 코어",
        special: "특수 코어",
      };
      vcores.forEach((v) => {
        const type = (v.vcore_type || "").toLowerCase();
        if (coreGroups[type]) coreGroups[type].push(v);
      });

      Object.entries(typeMap).forEach(([type, title]) => {
        const cores = coreGroups[type];
        if (cores.length === 0) return;

        const groupEl = utils.elt("div", "v-group");
        groupEl.append(utils.h4(title));
        const grid = utils.elt("div", "v-grid");

        cores.forEach((v) => {
          const type = (v.vcore_type || "").toLowerCase();
          const card = utils.elt("div", "v-card has-topchip");
          if (type) card.classList.add(`vtype-${type}`);
          card.style.alignSelf = "start";

          const typeShort =
            type === "skill"
              ? "스킬 코어"
              : type === "enhancement"
              ? "강화 코어"
              : "특수 코어";
          card.append(utils.chip(typeShort, "mini top-left"));

          const icon = utils.safeImg(v.vcore_icon, v.vcore_name, 40);
          if (icon) card.append(icon);

          const nameEl = utils.elt("div", "v-name", v.vcore_name || "-");
          card.append(nameEl);

          if (v.vcore_level != null) {
            let levelText = `Lv. ${v.vcore_level}`;
            if (v.slot_level > 0) {
              levelText += ` (+${v.slot_level})`;
            }
            const levelEl = utils.elt("div", "v-level", levelText);
            card.append(levelEl);
          }

          if (type === "enhancement") {
            const names = [
              v.vcore_skill_name_1,
              v.vcore_skill_name_2,
              v.vcore_skill_name_3,
            ].filter((s) => s && s !== "(Unknown)");
            if (names.length) {
              const sec = utils.chipSection("강화 대상", (stack) => {
                names.forEach((nm) => {
                  const parts = nm.split("/");
                  const mainName = parts[0];
                  const subName = parts[1] ? ` (${parts[1]})` : "";
                  stack.append(utils.chipRow(utils.chip(mainName + subName)))
                });
              });
              card.append(sec);
            }
          }
          
          const desc = [];
          if (v.vcore_skill_effect)
            utils.effectTextToChips(v.vcore_skill_effect).forEach((c) =>
              desc.push(c)
            );
          if (desc.length) utils.chipStack(card, desc, "stacked");

          grid.append(card);
        });
        groupEl.append(grid);
        vList.append(groupEl);
      });
    } else {
      utils.$("#vmatrix").classList.remove("hidden");
      vList.append(utils.emptyCard("V 매트릭스 없음"));
    }

    /* 하이퍼스탯 */
    const hs = S.hyper_stat?.data;
    const hyperStatsSec = utils.$("#hyper-stats");
    if (hs && hs.hyper_stat && hs.hyper_stat.length > 0) {
      hyperStatsSec.classList.remove("hidden");
      const list = utils.$("#hyper-stats-list");
      list.innerHTML = "";
      const usePresetNo = hs.use_preset_no || 1;
      const activePreset = hs.hyper_stat.find(p => p.preset_no == usePresetNo);
      if (activePreset && activePreset.hyper_stat_info) {
        (activePreset.hyper_stat_info || []).forEach(s => {
          const card = utils.elt("div", "stat-card");
          card.append(utils.elt("div", "stat-name", s.stat_type));
          card.append(utils.elt("div", "stat-level", `Lv. ${s.stat_level}`));
          list.append(card);
        });
      }
    } else {
      hyperStatsSec.classList.add("hidden");
    }

    renderUnion(S);

    /* HEXA 스탯 */
    const hexaStatData = S.hexamatrix_stat?.data;
    const hexaStatSec = utils.$("#hexa-stat");
    if (hexaStatData && hexaStatData.hexamatrix_stat && hexaStatData.hexamatrix_stat.length > 0) {
      hexaStatSec.classList.remove("hidden");
      const list = utils.$("#hexa-stat-list");
      list.innerHTML = "";
      hexaStatData.hexamatrix_stat.forEach(core => {
        const coreEl = utils.elt("div", "hexa-stat-core");
        coreEl.append(utils.h4(`코어 ${core.stat_core_slot}`));
        (core.stat_info || []).forEach(p => {
          const pageEl = utils.elt("div", "hexa-stat-page");
          pageEl.append(utils.chip(`페이지 ${p.page_no}`, p.activate_flag === "1" ? "active" : ""));
          const grid = utils.elt("div", "mini-grid");
          const stats = [
            { name: p.main_stat, level: p.main_stat_level },
            { name: p.sub_1_stat, level: p.sub_1_stat_level },
            { name: p.sub_2_stat, level: p.sub_2_stat_level },
          ];
          stats.forEach(s => {
            if (s.name) {
              const statCard = utils.elt("div", "stat-card");
              statCard.append(utils.elt("div", "stat-name", s.name));
              statCard.append(utils.elt("div", "stat-level", `Lv. ${s.level}`));
              grid.append(statCard);
            }
          });
          pageEl.append(grid);
          coreEl.append(pageEl);
        });
        list.append(coreEl);
      });
    } else {
      hexaStatSec.classList.add("hidden");
    }

    /* HEXA 스킬 */
    const hexaSkillData = S.hexamatrix_skill?.data;
    const hexaSkillSec = utils.$("#hexa-skill");
    if (hexaSkillData && hexaSkillData.hexamatrix_skill && hexaSkillData.hexamatrix_skill.length > 0) {
      hexaSkillSec.classList.remove("hidden");
      const list = utils.$("#hexa-skill-list");
      list.innerHTML = "";

      const skillGroups = {};
      const typeNameMap = {
        "스킬 코어": "스킬 코어",
        "마스터리 코어": "마스터리 코어",
        "강화 코어": "강화 코어",
        "공용 코어": "공용 코어"
      };

      hexaSkillData.hexamatrix_skill.forEach(s => {
        const type = s.skill_type;
        if (!skillGroups[type]) {
          skillGroups[type] = [];
        }
        skillGroups[type].push(s);
      });

      Object.entries(typeNameMap).forEach(([typeKey, typeDisplay]) => {
        const skills = skillGroups[typeKey];
        if (!skills || skills.length === 0) return;

        const groupEl = utils.elt("div", "hexa-skill-group");
        groupEl.append(utils.h4(typeDisplay));
        const grid = utils.elt("div", "grid-list");

        skills.forEach(s => {
          const card = utils.elt("div", "hexa-skill-card");
          const meta = utils.elt("div", "skill-meta");
          const icon = utils.safeImg(s.skill_icon, s.skill_name, 40);
          if (icon) meta.append(icon);
          const nameAndLevel = utils.elt("div");
          nameAndLevel.append(utils.elt("div", "skill-name", s.skill_name));
          nameAndLevel.append(utils.elt("div", "skill-level", `Lv. ${s.slot_level}`));
          meta.append(nameAndLevel);
          card.append(meta);
          if (s.skill_description) {
            card.append(utils.elt("div", "skill-desc", s.skill_description));
          }
          grid.append(card);
        });
        groupEl.append(grid);
        list.append(groupEl);
      });
    } else {
      hexaSkillSec.classList.add("hidden");
    }

    /* 길드 */
    const gu = S.guild?.data;
    const guildSec = utils.$("#guild-sec");
    if (gu) {
      guildSec.classList.remove("hidden");
      const guildInfoEl = utils.$("#guild-info");
      guildInfoEl.innerHTML = "";
      guildInfoEl.append(utils.elt("div", "kvline", `길드: ${gu.guild_name || "-"}`));
      guildInfoEl.append(utils.elt("div", "kvline", `레벨: ${gu.guild_level || "-"}`));
      guildInfoEl.append(
        utils.elt("div", "kvline", `마스터: ${gu.guild_master_name || "-"}`)
      );

      if (gu.guild_mark_string) {
        const mark = utils.elt("div", "guild-mark");
        mark.textContent = gu.guild_mark_string;
        guildInfoEl.append(mark);
      }

      const members = utils.$("#guild-members");
      members.innerHTML = "";
      (gu.guild_member || [])
        .sort((a, b) => (b.guild_activity || 0) - (a.guild_activity || 0))
        .forEach((m) => {
          const card = utils.elt("div", "mini-card");
          card.append(utils.elt("div", "skill-name", m.character_name));
          const sub = [];
          sub.push(`Lv.${m.character_level}`);
          sub.push(m.job_name);
          sub.push(`기여도: ${utils.toManNotation(m.guild_activity)}`);
          card.append(utils.elt("div", "mini-sub", sub.join(" · ")));
          members.append(card);
        });

      const skills = utils.$("#guild-skills");
      skills.innerHTML = "";
      (gu.guild_skill || []).forEach(s => {
        const card = utils.elt("div", "mini-card with-icon");
        const icon = utils.safeImg(s.skill_icon, s.skill_name, 32);
        if (icon) card.append(icon);
        const meta = utils.elt("div", "skill-meta");
        meta.append(utils.elt("div", "skill-name", `${s.skill_name} (Lv.${s.skill_level})`));
        meta.append(utils.elt("div", "mini-sub", s.skill_option));
        card.append(meta);
        skills.append(card);
      });

      const abilities = utils.$("#guild-abilities");
      abilities.innerHTML = "";
      (gu.guild_ability || []).forEach(a => {
        const card = utils.elt("div", "mini-card with-icon");
        const icon = utils.safeImg(a.ability_icon, a.ability_name, 32);
        if (icon) card.append(icon);
        const meta = utils.elt("div", "skill-meta");
        meta.append(utils.elt("div", "skill-name", `${a.ability_name} (Lv.${a.ability_level})`));
        card.append(meta);
        abilities.append(card);
      });

    } else {
      guildSec.classList.add("hidden");
    }
  } catch (err) {
    console.error("Render failed:", err);
    const main = utils.$("#main");
    main.innerHTML = "";
    const errCard = utils.elt("div", "card error");
    errCard.append(utils.elt("h3", "", "렌더링 실패"));
    errCard.append(
      utils.elt("p", "", "데이터를 화면에 표시하는 중 오류가 발생했습니다.")
    );
    errCard.append(utils.elt("pre", "error-pre", err.stack || err.message));
    main.append(errCard);
  }
}

export { renderAll };
