import { segment } from "oicq";
import lodash from "lodash";
import { Character } from "../components/models.js"
import { Cfg } from "../components/index.js";
import Profile from "../components/Profile.js";
import Format from "../components/Format.js"
import Reliquaries from "../components/models/Reliquaries.js";
import Calc from "../components/Calc.js";
import fs from "fs";



//角色昵称
let nameID = "";
let genshin = {};
await init();

const relationMap = {
  wife: {
    keyword: "老婆,媳妇,妻子,娘子".split(","),
    type: 0
  },
  husband: {
    keyword: "老公,丈夫,夫君,郎君".split(","),
    type: 1
  },
  gf: {
    keyword: "女朋友,女友,女神".split(","),
    type: 0
  },
  bf: {
    keyword: "男朋友,男友,男神".split(","),
    type: 1
  },
  daughter: {
    keyword: "女儿".split(","),
    type: 2
  },
  son: {
    keyword: "儿子".split(","),
    type: 3
  }
}

const relation = lodash.flatMap(relationMap, (d) => d.keyword);
export const wifeReg = `^#\\s*(${relation.join("|")})\\s*(设置|选择|指定|列表|查询|列表|是|是谁|照片|相片|写真|图像)?\\s*([^\\d]*)\\s*(\\d*)$`;

export async function init(isUpdate = false) {
  let _path = "file://" + process.cwd();
  let version = isUpdate ? new Date().getTime() : 0;
  genshin = await import(_path + `/config/genshin/roleId.js?version=${version}`);
  nameID = "";

}

// 查看当前角色
export async function character(e, { render, User }) {
  let msg = e.msg;
  if (!msg) {
    return;
  }
  if (Cfg.isDisable(e, "char.char")) {
    return;
  }

  let mode = 'card';
  if (/(详情|详细|面板|面版)$/.test(msg)) {
    mode = 'profile';
  }

  let name = msg.replace(/#|老婆|老公|详情|详细|面板|面版|[1|2|5][0-9]{8}/g, "").trim();
  let char = Character.get(name);
  if (!char) {
    return false;
  }

  if (mode === "profile") {
    return renderProfile(e, char, render);
  } else {
    return renderAvatar(e, char.name, render);
  }
}

let _pokeCharacter = false;

async function initPoke() {
  if (!_pokeCharacter) {
    _pokeCharacter = YunzaiApps.mysInfo.pokeCharacter;
  }
  YunzaiApps.mysInfo.pokeCharacter = async function (e, components) {
    if (Cfg.isDisable('char.poke', true)) {
      return await _pokeCharacter(e, components);
    }
    return await pokeCharacter(e, components);
  }
}

//#老婆
export async function wife(e, { render, User }) {
  let msg = e.msg || "";
  msg = msg.replace(/#|\w/g, "");
  if (!msg) return false;

  if (Cfg.isDisable(e, "char.wife")) {
    return;
  }

  let msgRet = (new RegExp(wifeReg)).exec(msg);
  if (!msgRet) return false;

  let target = msgRet[1],
    action = msgRet[2] || "卡片",
    actionParam = msgRet[3] || "";

  let targetCfg = lodash.find(relationMap, (cfg, key) => {
    cfg.key = key;
    return cfg.keyword.includes(target);
  });
  if (!targetCfg) return true;

  let avatarList = [], avatar = {}, wifeList = [];

  let MysApi = await e.getMysApi({
    auth: "all",
    targetType: Cfg.get("char.queryOther", true) ? "all" : "self",
    cookieType: "all",
    actionName: "查询信息"
  });
  let selfUser = MysApi.selfUser;

  let selfMysUser = await MysApi.selfUser.getMysUser();
  let isSelf = true;
  if (!selfMysUser || selfMysUser.uid !== MysApi.targetUser.uid) {
    isSelf = false;
  }

  switch (action) {
    case "卡片":
    case "照片":
    case "相片":
    case "图片":
    case "写真":
      // 展示老婆卡片

      // 如果选择过，则进行展示
      wifeList = await selfUser.getCfg(`wife.${targetCfg.key}`, []);
      let renderType = action === "卡片" ? "card" : "photo";
      // 存在设置
      if (wifeList && wifeList.length > 0 && isSelf) {
        if (wifeList[0] === "随机") {
          // 如果选择为全部，则从列表中随机选择一个
          avatarList = await getAvatarList(e, targetCfg.type, MysApi);
          let avatar = lodash.sample(avatarList);
          return renderAvatar(e, avatar, render, renderType);
        } else {
          // 如果指定过，则展示指定角色
          return renderAvatar(e, lodash.sample(wifeList), render, renderType);
        }
      } else {
        // 如果未指定过，则从列表中排序并随机选择前5个
        avatarList = await getAvatarList(e, targetCfg.type, MysApi);
        if (avatarList && avatarList.length > 0) {
          avatar = lodash.sample(avatarList.slice(0, 5));
          return renderAvatar(e, avatar, render, renderType);
        } else {
          e.reply(`在当前米游社公开展示的角色中未能找到适合展示的角色..`);
          return true;
        }
      }
      break;
    case "设置":
    case "选择":
    case "挑选":
    case "指定":
      if (!isSelf) {
        e.reply("只能指定自己的哦~");
        return true;
      }
      // 选择老婆
      actionParam = actionParam.replace(/，/g, ",");
      wifeList = actionParam.split(",");
      let addRet = [];
      if (lodash.intersection(["全部", "任意", "随机", "全都要"], wifeList).length > 0) {
        addRet = ['随机'];
      } else {
        wifeList = lodash.map(wifeList, (name) => {
          let char = Character.get(name);
          if (char) {
            return char.name;
          }
        });
        wifeList = lodash.filter(lodash.uniq(wifeList), (d) => !!d);
        avatarList = await getAvatarList(e, targetCfg.type, MysApi);
        avatarList = lodash.map(avatarList, (avatar) => avatar.name);
        avatarList = lodash.filter(avatarList, (d) => !!d);
        addRet = lodash.intersection(avatarList, wifeList);
        if (addRet.length === 0) {
          e.reply(`在可选的${targetCfg.keyword[0]}列表中未能找到 ${actionParam} ~`);
          if (!MysApi.isSelfCookie) {
            e.reply("请确认已在米游社展示对应角色，也可以绑定Cookie以查询所有角色..");
          }
          return true;
        }
      }
      await selfUser.setCfg(`wife.${targetCfg.key}`, addRet);
      e.reply(`${targetCfg.keyword[0]}已经设置：${addRet.join("，")}`);
      return true;
      break;
    case "列表":
    case "是":
    case "是谁":
      // 查看当前选择老婆

      if (!isSelf) {
        e.reply("只能查看自己的哦~");
        return true;
      }

      wifeList = await selfUser.getCfg(`wife.${targetCfg.key}`, []);
      if (wifeList && wifeList.length > 0) {
        e.reply(`你的${targetCfg.keyword[0]}是：${wifeList.join("，")}`);
      } else {
        e.reply(`尚未设置，回复#${targetCfg.keyword[0]}设置+角色名 来设置，如果设置多位请用逗号间隔`)
      }
      break;
  }
  return true;
}

async function pokeCharacter(e, { render }) {
  let MysApi = await e.getMysApi({
    auth: "all",
    targetType: Cfg.get("char.queryOther", true) ? "all" : "self",
    cookieType: "all",
    actionName: "查询信息"
  });
  let avatarList = await getAvatarList(e, false, MysApi);
  let avatar = lodash.sample(avatarList);
  return renderAvatar(e, avatar, render, 'card');
}

async function getAvatarList(e, type, MysApi) {
  let data = await MysApi.getCharacter();
  if (!data) return false;

  let avatars = data.avatars;

  if (avatars.length <= 0) {
    return false;
  }
  let list = [];
  for (let val of avatars) {
    if (type !== false) {
      if (!genshin.wifeData[type].includes(Number(val.id))) {
        continue;
      }
    }
    if (val.rarity > 5) {
      val.rarity = 5;
    }
    list.push(val);
  }

  if (list.length <= 0) {
    return false;
  }
  let sortKey = "level,fetter,weapon_level,rarity,weapon_rarity,cons,weapon_affix_level";
  list = lodash.orderBy(list, sortKey, lodash.repeat("desc,", sortKey.length).split(","));
  return list;
}


async function renderAvatar(e, avatar, render, renderType = "card") {

  // 如果传递的是名字，则获取
  if (typeof (avatar) === "string") {
    let char = Character.get(avatar);
    if (!char) {
      return false;
    }

    let MysApi = await e.getMysApi({
      auth: "all",
      targetType: Cfg.get("char.queryOther", true) ? "all" : "self",
      cookieType: "all",
      actionName: "查询信息"
    });
    if (!MysApi) return true;

    let charData = await MysApi.getCharacter();
    if (!charData) return true;

    let avatars = charData.avatars;
    let length = avatars.length;
    char.checkAvatars(avatars);
    avatars = lodash.keyBy(avatars, "id");

    if (!avatars[char.id]) {
      let name = lodash.truncate(e.sender.card, { length: 8 });
      if (length > 8) {
        e.reply([segment.at(e.user_id, name), `\n没有${e.msg}`]);
      } else {
        e.reply([segment.at(e.user_id, name), "\n请先在米游社展示该角色"]);
      }
      return true;
    }
    avatar = avatars[char.id];
  }
  return await renderCard(e, avatar, render, renderType);

}

// 渲染角色卡片
async function renderCard(e, avatar, render, renderType = "card") {
  let talent = await getTalent(e, avatar);
  // 计算皇冠个数
  let crownNum = lodash.filter(lodash.map(talent, (d) => d.level_original), (d) => d >= 10).length;

  let uid = e.targetUser.uid;

  let char = Character.get(avatar);

  if (!char) {
    return false;
  }
  let bg = char.getCardImg();

  if (renderType === "photo") {
    e.reply(segment.image(process.cwd() + "/plugins/miao-plugin/resources/" + bg.img));
  } else {
    //渲染图像
    let base64 = await render("character", "card", {
      save_id: uid,
      uid: uid,
      talent,
      crownNum,
      talentMap: { a: "普攻", e: "战技", q: "爆发" },
      //bg: getCharacterImg(avatar.name),
      bg,
      ...getCharacterData(avatar),
      ds: char.getData("name,id,title,desc"),
      cfgScale: Cfg.scale(1.25)
    }, "png");
    if (base64) {
      e.reply(segment.image(`base64://${base64}`));
    }
  }

  return true;
}

//获取角色技能数据
async function getTalent(e, avatars) {

  let MysApi = await e.getMysApi({
    auth: "all",
    targetType: Cfg.get("char.queryOther", true) ? "all" : "self",
    cookieType: "all",
    actionName: "查询信息"
  });
  if (!MysApi && !MysApi.isSelfCookie) return {};

  let skill = {};

  let skillRes = await MysApi.getAvatar(avatars.id);

  if (skillRes && skillRes.skill_list) {
    skill.id = avatars.id;
    let skill_list = lodash.orderBy(skillRes.skill_list, ["id"], ["asc"]);

    for (let val of skill_list) {
      val.level_original = val.level_current;
      if (val.name.includes("普通攻击")) {
        skill.a = val;
        continue;
      }
      if (val.max_level >= 10 && !skill.e) {
        skill.e = val;
        continue;
      }
      if (val.max_level >= 10 && !skill.q) {
        skill.q = val;

      }
    }
    if (avatars.actived_constellation_num >= 3) {
      if (avatars.constellations[2].effect.includes(skill.e.name)) {
        skill.e.level_current += 3;
      } else if (avatars.constellations[2].effect.includes(skill.q.name)) {
        skill.q.level_current += 3;
      }
    }
    if (avatars.actived_constellation_num >= 5) {
      if (avatars.constellations[4].effect.includes(skill.e.name)) {
        skill.e.level_current += 3;
      } else if (avatars.constellations[4].effect.includes(skill.q.name)) {
        skill.q.level_current += 3;
      }
    }
  }
  return skill;
}

export async function getProfile(e) {
  let MysApi = await e.getMysApi({
    auth: "cookie",
    targetType: "self",
    cookieType: "self",
    actionName: "更新角色信息"
  });

  if (!MysApi) {
    return false;
  }
  let selfUser = e.selfUser;
  if (!selfUser.isCookieUser) {
    e.reply("此功能仅绑定cookie用户可用")
    return true;
  }
  let data = await Profile.request(selfUser.uid, e);
  if (!data) {
    return true;
  }
  if (!data.chars) {
    e.reply("获取角色面板数据失败，请确认角色已在游戏内橱窗展示，并开放了查看详情。设置完毕后请5分钟后再进行请求~");
  } else {
    let ret = [];
    lodash.forEach(data.chars, (ds) => {
      let char = Character.get(ds.id);
      if (char) {
        ret.push(char.name);
      }
    })
    if (ret.length === 0) {
      e.reply("获取角色面板数据失败，未能请求到角色数据。请确认角色已在游戏内橱窗展示，并开放了查看详情。设置完毕后请5分钟后再进行请求~")
    } else {
      e.reply(`获取角色面板数据成功！本次获取成功角色: ${ret.join(", ")} 。\n你可以使用 #角色名+面板 来查看详细角色面板属性了`)
    }
  }

  return true;
}

// 获取角色数据
function getCharacterData(avatars) {
  let list = [];
  let set = {};
  let setArr = [];
  let text1 = "";
  let text2 = "";

  let weapon = {
    type: "weapon",
    name: avatars.weapon.name,
    showName: genshin.abbr[avatars.weapon.name] ? genshin.abbr[avatars.weapon.name] : avatars.weapon.name,
    level: avatars.weapon.level,
    affix_level: avatars.weapon.affix_level,
  };

  for (let val of avatars.reliquaries) {
    if (set[val.set.name]) {
      set[val.set.name]++;

      if (set[val.set.name] == 2) {
        if (text1) {
          text2 = "2件套：" + val.set.affixes[0].effect;
        } else {
          text1 = "2件套：" + val.set.affixes[0].effect;
        }
      }

      if (set[val.set.name] == 4) {
        text2 = "4件套：" + val.set.name;
      }
    } else {
      set[val.set.name] = 1;
    }

    list.push({
      type: "reliquaries",
      name: val.name,
      level: val.level,
    });
  }

  for (let val of Object.keys(set)) {
    setArr.push({
      name: val,
      num: set[val],
      showName: genshin.abbr[val] ? genshin.abbr[val] : val,
    });
  }

  if (avatars.reliquaries.length >= 2 && !text1) {
    text1 = "无套装效果";
  }

  if (avatars.id == "10000005") {
    avatars.name = "空";
  } else if (avatars.id == "10000007") {
    avatars.name = "荧";
  }

  let reliquaries = list[0];
  return {
    name: avatars.name,
    showName: genshin.abbr[avatars.name] ? genshin.abbr[avatars.name] : avatars.name,
    level: avatars.level,
    fetter: avatars.fetter,
    actived_constellation_num: avatars.actived_constellation_num,
    weapon,
    text1,
    text2,
    reliquaries,
    set: setArr,
  };
}

async function getAvatar(e, char, MysApi) {

  let charData = await MysApi.getCharacter();
  if (!charData) return true;

  let avatars = charData.avatars;
  let length = avatars.length;
  char.checkAvatars(avatars);
  avatars = lodash.keyBy(avatars, "id");

  if (!avatars[char.id]) {
    let name = lodash.truncate(e.sender.card, { length: 8 });
    if (length > 8) {
      e.reply([segment.at(e.user_id, name), `\n没有${e.msg}`]);
    } else {
      e.reply([segment.at(e.user_id, name), "\n请先在米游社展示该角色"]);
    }
    return false;
  }

  return avatars[char.id];
}


export async function renderProfile(e, char, render) {

  if (['荧', '空', '主角', '旅行者'].includes(char.name)) {
    e.reply("暂不支持主角的面板信息查看");
    return true;
  }

  let MysApi = await e.getMysApi({
    auth: "cookie",
    targetType: "self",
    cookieType: "self",
    actionName: "查询角色天赋命座等信息"
  });

  let selfUser = e.selfUser,
    uid = selfUser.uid;

  let profile = Profile.get(uid, char.id);
  if (!profile) {
    e.reply(`请先发送 #获取游戏角色详情 命令获取 ${char.name} 的面板详情。\n请确认已将需要获取的8位角色展示在【游戏内】的“角色展柜”中，并已打开“显示角色详情”。如刚进行设置请等待5分钟后再进行使用，以免浪费请求次数。 `)
    return true;
  }

  let a = profile.attr;
  let c = Format.comma,
    p = Format.pct;
  let attr = {
    hp: c(a.hp),
    hpPlus: c(a.hp - a.hpBase),
    atk: c(a.atk),
    atkPlus: c(a.atk - a.atkBase),
    def: c(a.def),
    defPlus: c(a.def - a.defBase),
    cRate: p(a.cRate),
    cDmg: p(a.cDmg),
    mastery: c(a.mastery),
    recharge: p(a.recharge),
    dmgBonus: p(Math.max(a.dmgBonus * 1 || 0, a.phyBonus * 1 || 0))
  };

  let avatar = await getAvatar(e, char, MysApi);
  let talent = await getTalent(e, avatar);


  let posIdx = {
    "生之花": {
      idx: 1
    },
    "死之羽": {
      idx: 2
    },
    "时之沙": {
      idx: 3
    },
    "空之杯": {
      idx: 4
    },
    "理之冠": {
      idx: 5
    }
  };

  let reliquaries = [], totalMark = 0, totalMaxMark = 0;

  let { titles: usefulTitles, mark: usefulMark } = Reliquaries.getUseful(avatar.name);

  lodash.forEach(avatar.reliquaries, (ds) => {
    let pos = ds.pos_name;
    let arti = profile.artis[`arti${posIdx[pos].idx}`];
    if (arti) {
      let mark = Reliquaries.getMark(avatar.name, arti.attrs);
      let maxMark = Reliquaries.getMaxMark(char.name, arti.main[0] || "");
      totalMark += mark;
      totalMaxMark += maxMark;
      ds.mark = c(mark, 1);
      ds.markType = Reliquaries.getMarkScore(mark, maxMark);
      ds.main = Profile.formatArti(arti.main);
      ds.attrs = Profile.formatArti(arti.attrs);
    }
    posIdx[pos].data = ds;
  });

  lodash.forEach(posIdx, (ds) => {
    if (ds && ds.data) {
      reliquaries.push(ds.data);
    } else {
      reliquaries.push({});
    }
  });

  let dmgMsg = [], dmgData = [];
  let dmgCalc = await Calc.calcData(profile, char, avatar);
  if (dmgCalc && dmgCalc.ret) {
    lodash.forEach(dmgCalc.ret, (ds) => {
      ds.dmg = Format.comma(ds.dmg, 1);
      ds.avg = Format.comma(ds.avg, 1);
      dmgData.push(ds);
    })
    dmgMsg = dmgCalc.msg;
  }

  let base64 = await render("character", "detail", {
    save_id: uid,
    uid: uid,
    data: profile,
    attr,
    avatar,
    talent,
    cons: char.cons,
    name: char.name,
    elem: char.elem,
    dmgData,
    dmgMsg,
    reliquaries,
    totalMark: c(totalMark, 1),
    totalMaxMark,
    markScore: Reliquaries.getMarkScore(totalMark, totalMaxMark),
    weapon: avatar.weapon,
    usefulTitles,
    usefulMark,
    talentMap: { a: "普攻", e: "战技", q: "爆发" },
    cfgScale: Cfg.scale(1.5)
  }, "png");
  if (base64) {
    e.reply(segment.image(`base64://${base64}`));
  }
  return true;
}