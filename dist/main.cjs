"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/dotenv/package.json
var require_package = __commonJS({
  "node_modules/dotenv/package.json"(exports2, module2) {
    module2.exports = {
      name: "dotenv",
      version: "17.2.3",
      description: "Loads environment variables from .env file",
      main: "lib/main.js",
      types: "lib/main.d.ts",
      exports: {
        ".": {
          types: "./lib/main.d.ts",
          require: "./lib/main.js",
          default: "./lib/main.js"
        },
        "./config": "./config.js",
        "./config.js": "./config.js",
        "./lib/env-options": "./lib/env-options.js",
        "./lib/env-options.js": "./lib/env-options.js",
        "./lib/cli-options": "./lib/cli-options.js",
        "./lib/cli-options.js": "./lib/cli-options.js",
        "./package.json": "./package.json"
      },
      scripts: {
        "dts-check": "tsc --project tests/types/tsconfig.json",
        lint: "standard",
        pretest: "npm run lint && npm run dts-check",
        test: "tap run tests/**/*.js --allow-empty-coverage --disable-coverage --timeout=60000",
        "test:coverage": "tap run tests/**/*.js --show-full-coverage --timeout=60000 --coverage-report=text --coverage-report=lcov",
        prerelease: "npm test",
        release: "standard-version"
      },
      repository: {
        type: "git",
        url: "git://github.com/motdotla/dotenv.git"
      },
      homepage: "https://github.com/motdotla/dotenv#readme",
      funding: "https://dotenvx.com",
      keywords: [
        "dotenv",
        "env",
        ".env",
        "environment",
        "variables",
        "config",
        "settings"
      ],
      readmeFilename: "README.md",
      license: "BSD-2-Clause",
      devDependencies: {
        "@types/node": "^18.11.3",
        decache: "^4.6.2",
        sinon: "^14.0.1",
        standard: "^17.0.0",
        "standard-version": "^9.5.0",
        tap: "^19.2.0",
        typescript: "^4.8.4"
      },
      engines: {
        node: ">=12"
      },
      browser: {
        fs: false
      }
    };
  }
});

// node_modules/dotenv/lib/main.js
var require_main = __commonJS({
  "node_modules/dotenv/lib/main.js"(exports2, module2) {
    "use strict";
    var fs = require("fs");
    var path = require("path");
    var os = require("os");
    var crypto = require("crypto");
    var packageJson = require_package();
    var version = packageJson.version;
    var TIPS = [
      "\u{1F510} encrypt with Dotenvx: https://dotenvx.com",
      "\u{1F510} prevent committing .env to code: https://dotenvx.com/precommit",
      "\u{1F510} prevent building .env in docker: https://dotenvx.com/prebuild",
      "\u{1F4E1} add observability to secrets: https://dotenvx.com/ops",
      "\u{1F465} sync secrets across teammates & machines: https://dotenvx.com/ops",
      "\u{1F5C2}\uFE0F backup and recover secrets: https://dotenvx.com/ops",
      "\u2705 audit secrets and track compliance: https://dotenvx.com/ops",
      "\u{1F504} add secrets lifecycle management: https://dotenvx.com/ops",
      "\u{1F511} add access controls to secrets: https://dotenvx.com/ops",
      "\u{1F6E0}\uFE0F  run anywhere with `dotenvx run -- yourcommand`",
      "\u2699\uFE0F  specify custom .env file path with { path: '/custom/path/.env' }",
      "\u2699\uFE0F  enable debug logging with { debug: true }",
      "\u2699\uFE0F  override existing env vars with { override: true }",
      "\u2699\uFE0F  suppress all logs with { quiet: true }",
      "\u2699\uFE0F  write to custom object with { processEnv: myObject }",
      "\u2699\uFE0F  load multiple .env files with { path: ['.env.local', '.env'] }"
    ];
    function _getRandomTip() {
      return TIPS[Math.floor(Math.random() * TIPS.length)];
    }
    function parseBoolean(value) {
      if (typeof value === "string") {
        return !["false", "0", "no", "off", ""].includes(value.toLowerCase());
      }
      return Boolean(value);
    }
    function supportsAnsi() {
      return process.stdout.isTTY;
    }
    function dim(text) {
      return supportsAnsi() ? `\x1B[2m${text}\x1B[0m` : text;
    }
    var LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;
    function parse(src) {
      const obj = {};
      let lines = src.toString();
      lines = lines.replace(/\r\n?/mg, "\n");
      let match;
      while ((match = LINE.exec(lines)) != null) {
        const key = match[1];
        let value = match[2] || "";
        value = value.trim();
        const maybeQuote = value[0];
        value = value.replace(/^(['"`])([\s\S]*)\1$/mg, "$2");
        if (maybeQuote === '"') {
          value = value.replace(/\\n/g, "\n");
          value = value.replace(/\\r/g, "\r");
        }
        obj[key] = value;
      }
      return obj;
    }
    function _parseVault(options) {
      options = options || {};
      const vaultPath = _vaultPath(options);
      options.path = vaultPath;
      const result = DotenvModule.configDotenv(options);
      if (!result.parsed) {
        const err = new Error(`MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`);
        err.code = "MISSING_DATA";
        throw err;
      }
      const keys = _dotenvKey(options).split(",");
      const length = keys.length;
      let decrypted;
      for (let i = 0; i < length; i++) {
        try {
          const key = keys[i].trim();
          const attrs = _instructions(result, key);
          decrypted = DotenvModule.decrypt(attrs.ciphertext, attrs.key);
          break;
        } catch (error) {
          if (i + 1 >= length) {
            throw error;
          }
        }
      }
      return DotenvModule.parse(decrypted);
    }
    function _warn(message) {
      console.error(`[dotenv@${version}][WARN] ${message}`);
    }
    function _debug(message) {
      console.log(`[dotenv@${version}][DEBUG] ${message}`);
    }
    function _log(message) {
      console.log(`[dotenv@${version}] ${message}`);
    }
    function _dotenvKey(options) {
      if (options && options.DOTENV_KEY && options.DOTENV_KEY.length > 0) {
        return options.DOTENV_KEY;
      }
      if (process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0) {
        return process.env.DOTENV_KEY;
      }
      return "";
    }
    function _instructions(result, dotenvKey) {
      let uri;
      try {
        uri = new URL(dotenvKey);
      } catch (error) {
        if (error.code === "ERR_INVALID_URL") {
          const err = new Error("INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        }
        throw error;
      }
      const key = uri.password;
      if (!key) {
        const err = new Error("INVALID_DOTENV_KEY: Missing key part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environment = uri.searchParams.get("environment");
      if (!environment) {
        const err = new Error("INVALID_DOTENV_KEY: Missing environment part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environmentKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
      const ciphertext = result.parsed[environmentKey];
      if (!ciphertext) {
        const err = new Error(`NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${environmentKey} in your .env.vault file.`);
        err.code = "NOT_FOUND_DOTENV_ENVIRONMENT";
        throw err;
      }
      return { ciphertext, key };
    }
    function _vaultPath(options) {
      let possibleVaultPath = null;
      if (options && options.path && options.path.length > 0) {
        if (Array.isArray(options.path)) {
          for (const filepath of options.path) {
            if (fs.existsSync(filepath)) {
              possibleVaultPath = filepath.endsWith(".vault") ? filepath : `${filepath}.vault`;
            }
          }
        } else {
          possibleVaultPath = options.path.endsWith(".vault") ? options.path : `${options.path}.vault`;
        }
      } else {
        possibleVaultPath = path.resolve(process.cwd(), ".env.vault");
      }
      if (fs.existsSync(possibleVaultPath)) {
        return possibleVaultPath;
      }
      return null;
    }
    function _resolveHome(envPath) {
      return envPath[0] === "~" ? path.join(os.homedir(), envPath.slice(1)) : envPath;
    }
    function _configVault(options) {
      const debug = parseBoolean(process.env.DOTENV_CONFIG_DEBUG || options && options.debug);
      const quiet = parseBoolean(process.env.DOTENV_CONFIG_QUIET || options && options.quiet);
      if (debug || !quiet) {
        _log("Loading env from encrypted .env.vault");
      }
      const parsed = DotenvModule._parseVault(options);
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsed, options);
      return { parsed };
    }
    function configDotenv(options) {
      const dotenvPath = path.resolve(process.cwd(), ".env");
      let encoding = "utf8";
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      let debug = parseBoolean(processEnv.DOTENV_CONFIG_DEBUG || options && options.debug);
      let quiet = parseBoolean(processEnv.DOTENV_CONFIG_QUIET || options && options.quiet);
      if (options && options.encoding) {
        encoding = options.encoding;
      } else {
        if (debug) {
          _debug("No encoding is specified. UTF-8 is used by default");
        }
      }
      let optionPaths = [dotenvPath];
      if (options && options.path) {
        if (!Array.isArray(options.path)) {
          optionPaths = [_resolveHome(options.path)];
        } else {
          optionPaths = [];
          for (const filepath of options.path) {
            optionPaths.push(_resolveHome(filepath));
          }
        }
      }
      let lastError;
      const parsedAll = {};
      for (const path2 of optionPaths) {
        try {
          const parsed = DotenvModule.parse(fs.readFileSync(path2, { encoding }));
          DotenvModule.populate(parsedAll, parsed, options);
        } catch (e) {
          if (debug) {
            _debug(`Failed to load ${path2} ${e.message}`);
          }
          lastError = e;
        }
      }
      const populated = DotenvModule.populate(processEnv, parsedAll, options);
      debug = parseBoolean(processEnv.DOTENV_CONFIG_DEBUG || debug);
      quiet = parseBoolean(processEnv.DOTENV_CONFIG_QUIET || quiet);
      if (debug || !quiet) {
        const keysCount = Object.keys(populated).length;
        const shortPaths = [];
        for (const filePath of optionPaths) {
          try {
            const relative = path.relative(process.cwd(), filePath);
            shortPaths.push(relative);
          } catch (e) {
            if (debug) {
              _debug(`Failed to load ${filePath} ${e.message}`);
            }
            lastError = e;
          }
        }
        _log(`injecting env (${keysCount}) from ${shortPaths.join(",")} ${dim(`-- tip: ${_getRandomTip()}`)}`);
      }
      if (lastError) {
        return { parsed: parsedAll, error: lastError };
      } else {
        return { parsed: parsedAll };
      }
    }
    function config(options) {
      if (_dotenvKey(options).length === 0) {
        return DotenvModule.configDotenv(options);
      }
      const vaultPath = _vaultPath(options);
      if (!vaultPath) {
        _warn(`You set DOTENV_KEY but you are missing a .env.vault file at ${vaultPath}. Did you forget to build it?`);
        return DotenvModule.configDotenv(options);
      }
      return DotenvModule._configVault(options);
    }
    function decrypt(encrypted, keyStr) {
      const key = Buffer.from(keyStr.slice(-64), "hex");
      let ciphertext = Buffer.from(encrypted, "base64");
      const nonce = ciphertext.subarray(0, 12);
      const authTag = ciphertext.subarray(-16);
      ciphertext = ciphertext.subarray(12, -16);
      try {
        const aesgcm = crypto.createDecipheriv("aes-256-gcm", key, nonce);
        aesgcm.setAuthTag(authTag);
        return `${aesgcm.update(ciphertext)}${aesgcm.final()}`;
      } catch (error) {
        const isRange = error instanceof RangeError;
        const invalidKeyLength = error.message === "Invalid key length";
        const decryptionFailed = error.message === "Unsupported state or unable to authenticate data";
        if (isRange || invalidKeyLength) {
          const err = new Error("INVALID_DOTENV_KEY: It must be 64 characters long (or more)");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        } else if (decryptionFailed) {
          const err = new Error("DECRYPTION_FAILED: Please check your DOTENV_KEY");
          err.code = "DECRYPTION_FAILED";
          throw err;
        } else {
          throw error;
        }
      }
    }
    function populate(processEnv, parsed, options = {}) {
      const debug = Boolean(options && options.debug);
      const override = Boolean(options && options.override);
      const populated = {};
      if (typeof parsed !== "object") {
        const err = new Error("OBJECT_REQUIRED: Please check the processEnv argument being passed to populate");
        err.code = "OBJECT_REQUIRED";
        throw err;
      }
      for (const key of Object.keys(parsed)) {
        if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
          if (override === true) {
            processEnv[key] = parsed[key];
            populated[key] = parsed[key];
          }
          if (debug) {
            if (override === true) {
              _debug(`"${key}" is already defined and WAS overwritten`);
            } else {
              _debug(`"${key}" is already defined and was NOT overwritten`);
            }
          }
        } else {
          processEnv[key] = parsed[key];
          populated[key] = parsed[key];
        }
      }
      return populated;
    }
    var DotenvModule = {
      configDotenv,
      _configVault,
      _parseVault,
      config,
      decrypt,
      parse,
      populate
    };
    module2.exports.configDotenv = DotenvModule.configDotenv;
    module2.exports._configVault = DotenvModule._configVault;
    module2.exports._parseVault = DotenvModule._parseVault;
    module2.exports.config = DotenvModule.config;
    module2.exports.decrypt = DotenvModule.decrypt;
    module2.exports.parse = DotenvModule.parse;
    module2.exports.populate = DotenvModule.populate;
    module2.exports = DotenvModule;
  }
});

// node_modules/dotenv/lib/env-options.js
var require_env_options = __commonJS({
  "node_modules/dotenv/lib/env-options.js"(exports2, module2) {
    "use strict";
    var options = {};
    if (process.env.DOTENV_CONFIG_ENCODING != null) {
      options.encoding = process.env.DOTENV_CONFIG_ENCODING;
    }
    if (process.env.DOTENV_CONFIG_PATH != null) {
      options.path = process.env.DOTENV_CONFIG_PATH;
    }
    if (process.env.DOTENV_CONFIG_QUIET != null) {
      options.quiet = process.env.DOTENV_CONFIG_QUIET;
    }
    if (process.env.DOTENV_CONFIG_DEBUG != null) {
      options.debug = process.env.DOTENV_CONFIG_DEBUG;
    }
    if (process.env.DOTENV_CONFIG_OVERRIDE != null) {
      options.override = process.env.DOTENV_CONFIG_OVERRIDE;
    }
    if (process.env.DOTENV_CONFIG_DOTENV_KEY != null) {
      options.DOTENV_KEY = process.env.DOTENV_CONFIG_DOTENV_KEY;
    }
    module2.exports = options;
  }
});

// node_modules/dotenv/lib/cli-options.js
var require_cli_options = __commonJS({
  "node_modules/dotenv/lib/cli-options.js"(exports2, module2) {
    "use strict";
    var re = /^dotenv_config_(encoding|path|quiet|debug|override|DOTENV_KEY)=(.+)$/;
    module2.exports = function optionMatcher(args) {
      const options = args.reduce(function(acc, cur) {
        const matches = cur.match(re);
        if (matches) {
          acc[matches[1]] = matches[2];
        }
        return acc;
      }, {});
      if (!("quiet" in options)) {
        options.quiet = "true";
      }
      return options;
    };
  }
});

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => main_default
});
module.exports = __toCommonJS(main_exports);

// node_modules/dotenv/config.js
(function() {
  require_main().config(
    Object.assign(
      {},
      require_env_options(),
      require_cli_options()(process.argv)
    )
  );
})();

// src/main.ts
var import_fastify = __toESM(require("fastify"), 1);
var import_cors = __toESM(require("@fastify/cors"), 1);
var import_jwt = __toESM(require("@fastify/jwt"), 1);
var import_multipart = __toESM(require("@fastify/multipart"), 1);
var import_fastify_socket = __toESM(require("fastify-socket.io"), 1);
var import_node_cron = __toESM(require("node-cron"), 1);

// src/lib/prisma.ts
var import_client = require("@prisma/client");
var prisma = new import_client.PrismaClient({
  log: ["error", "warn"]
});

// src/infra/services/mail-service.ts
var nodemailer = __toESM(require("nodemailer"), 1);
var MailService = class {
  transporter;
  constructor() {
    console.log("Credenciais SMTP:", {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD ? "********" : "VAZIO",
      host: process.env.SMTP_HOST
    });
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      // true para 465, false para outras portas
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });
  }
  async sendEmail(to, subject, html) {
    try {
      await this.transporter.sendMail({
        from: `"RCS Gest\xE3o Jur\xEDdica" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html
      });
      console.log(`\u{1F4E7} E-mail enviado com sucesso para: ${to}`);
    } catch (error) {
      console.error("\u274C Erro ao enviar e-mail:", error);
    }
  }
};

// src/shared/password-hasher.ts
var bcrypt = __toESM(require("bcrypt"), 1);
var PasswordHasher = class {
  static SALT_ROUNDS = 10;
  static async hash(password) {
    return await bcrypt.hash(password, this.SALT_ROUNDS);
  }
  static async compare(password, hash2) {
    return await bcrypt.compare(password, hash2);
  }
};

// src/modules/auth/auth.service.ts
var AuthService = class {
  constructor(userRepository) {
    this.userRepository = userRepository;
  }
  async login(data) {
    const user = await this.userRepository.findByEmail(data.email);
    if (!user) throw new Error("E-mail ou senha incorretos.");
    const passwordMatch = await PasswordHasher.compare(data.senha, user.senha);
    if (!passwordMatch) throw new Error("E-mail ou senha incorretos.");
    const { senha: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
  async register(data) {
    const userExists = await this.userRepository.findByEmail(data.email);
    if (userExists) throw new Error("Usu\xE1rio j\xE1 cadastrado.");
    const hashedPassword = await PasswordHasher.hash(data.senha);
    const user = await this.userRepository.create({
      ...data,
      senha: hashedPassword
    });
    const { senha: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
};

// src/modules/users/dto/user.dto.ts
var import_zod = require("zod");
var userCreateSchema = import_zod.z.object({
  nome: import_zod.z.string().min(3, "Nome muito curto"),
  email: import_zod.z.string().email("E-mail inv\xE1lido"),
  senha: import_zod.z.string().min(6, "A senha deve ter no m\xEDnimo 6 caracteres"),
  tipo: import_zod.z.enum(["advogado_admin", "advogado", "cliente"]).default("cliente"),
  cpf: import_zod.z.string().optional(),
  telefone: import_zod.z.string().optional()
});

// src/modules/auth/dto/login.dto.ts
var import_zod2 = require("zod");
var loginSchema = import_zod2.z.object({
  email: import_zod2.z.string().email("E-mail inv\xE1lido"),
  senha: import_zod2.z.string().min(6, "A senha deve ter no m\xEDnimo 6 caracteres")
});

// src/modules/auth/auth.controller.ts
var AuthController = class {
  constructor(authService) {
    this.authService = authService;
  }
  async register(request, reply) {
    const data = userCreateSchema.parse(request.body);
    try {
      const user = await this.authService.register(data);
      return reply.status(201).send({
        id: user.id,
        nome: user.nome,
        email: user.email,
        tipo: user.tipo
      });
    } catch (error) {
      return reply.status(400).send({ message: error.message });
    }
  }
  async login(request, reply) {
    const data = loginSchema.parse(request.body);
    try {
      const user = await this.authService.login(data);
      const token = await reply.jwtSign(
        { nome: user.nome, tipo: user.tipo, email: user.email },
        { sign: { sub: user.id, expiresIn: "7d" } }
      );
      return reply.send({
        user: {
          id: user.id,
          nome: user.nome,
          email: user.email,
          tipo: user.tipo
        },
        access_token: token,
        token_type: "bearer"
      });
    } catch (error) {
      return reply.status(401).send({ message: error.message });
    }
  }
};

// src/modules/users/repositories/prisma-user.repository.ts
var import_client2 = require("@prisma/client");
var PrismaUserRepository = class {
  // Injetamos a instância do Prisma aqui
  constructor(prisma3) {
    this.prisma = prisma3;
  }
  async create(data) {
    return await this.prisma.user.create({ data });
  }
  async findByEmail(email) {
    return await this.prisma.user.findUnique({
      where: { email }
    });
  }
  async findById(id) {
    return await this.prisma.user.findUnique({
      where: { id }
    });
  }
};

// src/modules/auth/auth.module.ts
async function authModule(app2) {
  const userRepository = new PrismaUserRepository(prisma);
  const authService = new AuthService(userRepository);
  const authController = new AuthController(authService);
  app2.register(async (group) => {
    group.post("/register", (req, rep) => authController.register(req, rep));
    group.post("/login", (req, rep) => authController.login(req, rep));
  }, { prefix: "/auth" });
}

// src/modules/dashboard/dashboard.service.ts
var DashboardService = class {
  async getStats(userId) {
    const hoje = /* @__PURE__ */ new Date();
    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);
    const [processos, compromissosHojeCount, transacoesMes] = await Promise.all([
      prisma.processo.findMany({
        where: { userId, arquivado: false }
        // Filtro corrigido para userId
      }),
      prisma.compromisso.count({
        where: {
          userId,
          startDate: { gte: hoje, lt: amanha }
        }
      }),
      // Busca transações de entrada do mês atual
      prisma.transacao.findMany({
        where: {
          createdBy: userId,
          tipo: "entrada",
          createdAt: { gte: primeiroDiaMes }
        }
      })
    ]);
    const receitaMes = transacoesMes.reduce((acc, t) => acc + t.valor, 0);
    return {
      totalProcessos: processos.length,
      processosAtivos: processos.filter((p) => !p.arquivado).length,
      compromissosHoje: compromissosHojeCount,
      receitaMes,
      // Campo exigido pelo front-end
      // Dados extras para os gráficos que você já preparou
      financeiro: {
        totalPrevisto: processos.reduce((acc, p) => acc + (p.valorPrevistoIniciais + p.valorPrevistoExito), 0),
        totalRecebido: processos.reduce((acc, p) => acc + (p.totalRecebidoIniciais + p.totalRecebidoExito), 0),
        totalCustos: processos.reduce((acc, p) => acc + p.totalCustosReais, 0)
      },
      statusDistribuicao: {
        contratoFechado: processos.filter((p) => p.statusGeral === "Contrato Fechado").length,
        emAndamento: processos.filter((p) => p.statusGeral === "Em Andamento").length
      }
    };
  }
  async getGraficoFinanceiro(userId) {
    const transacoes = await prisma.transacao.findMany({
      where: { createdBy: userId, arquivado: false },
      orderBy: { createdAt: "asc" }
    });
    return {
      entradas: transacoes.filter((t) => t.tipo === "entrada").map((t) => ({ data: t.data, valor: t.valor })),
      saidas: transacoes.filter((t) => t.tipo === "saida").map((t) => ({ data: t.data, valor: t.valor }))
    };
  }
  async getGraficoProcessos(userId) {
    const processos = await prisma.processo.findMany({
      where: { userId, arquivado: false },
      // Usando o campo 'userId' padronizado
      select: { statusGeral: true }
    });
    const distribuicao = processos.reduce((acc, p) => {
      acc[p.statusGeral] = (acc[p.statusGeral] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(distribuicao).map(([label, value]) => ({ label, value }));
  }
  async getProdutividade(userId) {
    const [concluidas, pendentes] = await Promise.all([
      prisma.tarefa.count({ where: { userId, concluida: true } }),
      prisma.tarefa.count({ where: { userId, concluida: false } })
    ]);
    return [
      { status: "Conclu\xEDdas", total: concluidas },
      { status: "Pendentes", total: pendentes }
    ];
  }
};

// src/modules/dashboard/dashboard.controller.ts
var DashboardController = class {
  constructor(dashboardService) {
    this.dashboardService = dashboardService;
  }
  async getStats(request, reply) {
    const userId = request.user.sub;
    const stats = await this.dashboardService.getStats(userId);
    return reply.send(stats);
  }
  async getFinanceiro(request, reply) {
    const userId = request.user.sub;
    const data = await this.dashboardService.getGraficoFinanceiro(userId);
    return reply.send(data);
  }
  async getProcessos(request, reply) {
    const userId = request.user.sub;
    const data = await this.dashboardService.getGraficoProcessos(userId);
    return reply.send(data);
  }
  async getProdutividade(request, reply) {
    const userId = request.user.sub;
    const data = await this.dashboardService.getProdutividade(userId);
    return reply.send(data);
  }
};

// src/modules/dashboard/dashboard.module.ts
async function dashboardModule(app2) {
  const service = new DashboardService();
  const controller = new DashboardController(service);
  app2.register(async (group) => {
    group.addHook("preHandler", app2.authenticate);
    group.get("/stats", (req, res) => controller.getStats(req, res));
    group.get("/grafico-financeiro", (req, res) => controller.getFinanceiro(req, res));
    group.get("/grafico-processos", (req, res) => controller.getProcessos(req, res));
    group.get("/produtividade", (req, res) => controller.getProdutividade(req, res));
  }, { prefix: "/dashboard" });
}

// src/modules/processos/processos.service.ts
var import_client3 = require("@prisma/client");

// src/modules/processos/entities/processo.entity.ts
var ProcessoEntity = class {
  constructor(props) {
    this.props = props;
    this.validateHonorarios();
  }
  validateHonorarios() {
    if (["\xCAxito", "Ambos"].includes(this.props.tipoHonorarios) && !this.props.basePrevisao) {
      throw new Error("Processos com honor\xE1rios de \xEAxito precisam de uma base de previs\xE3o.");
    }
  }
};

// src/modules/processos/processos.service.ts
var ProcessosService = class {
  // -----------------------------------------------------------------------
  // CRIAR PROCESSO
  // -----------------------------------------------------------------------
  async create(input, userId) {
    if (input.numeroProcesso) {
      const existe = await prisma.processo.findFirst({
        where: { numeroProcesso: input.numeroProcesso }
      });
      if (existe) throw new Error("J\xE1 existe um processo com este n\xFAmero.");
    }
    const entity = new ProcessoEntity(input);
    let clienteIdConectado;
    if (input.clienteCpf) {
      const cliente = await prisma.cliente.upsert({
        where: { cpf: input.clienteCpf },
        update: {
          nome: input.clienteNome,
          email: input.clienteEmail ?? null,
          // Opcional: Atualizar telefone se o cliente já existia
          telefone: input.clienteTelefone
        },
        create: {
          nome: input.clienteNome,
          cpf: input.clienteCpf,
          email: input.clienteEmail ?? null,
          telefone: input.clienteTelefone
          // <--- USA O TELEFONE REAL
        }
      });
      clienteIdConectado = cliente.id;
    } else {
      const cliente = await prisma.cliente.upsert({
        where: { telefone: input.clienteTelefone },
        update: {
          nome: input.clienteNome,
          email: input.clienteEmail ?? null
        },
        create: {
          nome: input.clienteNome,
          email: input.clienteEmail ?? null,
          telefone: input.clienteTelefone,
          // <--- USA O TELEFONE REAL
          cpf: null
          // Sem CPF por enquanto
        }
      });
      clienteIdConectado = cliente.id;
    }
    const prismaData = {
      // --- CAMPOS OBRIGATÓRIOS ---
      descricaoObjeto: entity.props.descricaoObjeto,
      dataFechamentoContrato: entity.props.dataFechamentoContrato,
      responsavel: entity.props.responsavel,
      tipoHonorarios: entity.props.tipoHonorarios,
      statusProtocolamento: entity.props.statusProtocolamento,
      statusGeral: entity.props.statusGeral,
      valorPrevistoIniciais: entity.props.valorPrevistoIniciais,
      valorPrevistoExito: entity.props.valorPrevistoExito,
      custosPrevistos: entity.props.custosPrevistos,
      clienteNome: entity.props.clienteNome,
      // --- CAMPOS OPCIONAIS (NULLABLE) ---
      clienteCpf: entity.props.clienteCpf ?? null,
      clienteEmail: entity.props.clienteEmail ?? null,
      numeroProcesso: entity.props.numeroProcesso ?? null,
      basePrevisao: entity.props.basePrevisao ?? null,
      dataEstimadaRecebimento: entity.props.dataEstimadaRecebimento ?? null,
      // --- CAMPOS COM DEFAULT ---
      ...entity.props.numeroInterno ? { numeroInterno: entity.props.numeroInterno } : {},
      // --- CONEXÕES ---
      cliente: { connect: { id: clienteIdConectado } },
      user: { connect: { id: userId } },
      // --- ARQUIVOS (NOVO) ---
      // Cria os arquivos vinculados na tabela processo_arquivos atomicamente
      arquivos: {
        create: input.arquivos?.map((arq) => ({
          tipo: arq.tipo,
          url: arq.url,
          nomeArquivo: arq.nomeArquivo
        })) || []
      }
    };
    return await prisma.processo.create({
      data: prismaData,
      include: { arquivos: true }
    });
  }
  // -----------------------------------------------------------------------
  // OUTROS MÉTODOS
  // -----------------------------------------------------------------------
  async list(userId, arquivado = false) {
    return await prisma.processo.findMany({
      where: { userId, arquivado },
      orderBy: { createdAt: "desc" },
      include: { cliente: true }
    });
  }
  async findById(id, userId) {
    return await prisma.processo.findFirst({
      where: { id, userId },
      include: {
        cliente: true,
        arquivos: true
        // <--- Incluímos os arquivos na busca
      }
    });
  }
  async setArquivado(id, userId, status) {
    return await prisma.processo.updateMany({
      where: { id, userId },
      data: {
        arquivado: status,
        dataArquivamento: status ? /* @__PURE__ */ new Date() : null
      }
    });
  }
  async update(id, userId, input) {
    const processo = await prisma.processo.findFirst({ where: { id, userId } });
    if (!processo) throw new Error("Processo n\xE3o encontrado.");
    const dataToUpdate = { ...input };
    Object.keys(dataToUpdate).forEach((key) => {
      if (dataToUpdate[key] === void 0) delete dataToUpdate[key];
    });
    return await prisma.processo.update({
      where: { id },
      data: dataToUpdate
    });
  }
  async listAndamentos(processoId, userId) {
    const processo = await prisma.processo.findFirst({ where: { id: processoId, userId } });
    if (!processo) throw new Error("Processo n\xE3o encontrado.");
    return await prisma.andamento.findMany({
      where: { processoId },
      orderBy: { createdAt: "desc" },
      include: { user: true }
    });
  }
  async createAndamento(processoId, userId, data) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("Usu\xE1rio n\xE3o encontrado");
    return await prisma.andamento.create({
      data: {
        processoId,
        titulo: data.tipo,
        descricao: data.descricao,
        autorNome: user.nome || "Advogado",
        createdBy: userId
      }
    });
  }
};

// src/modules/processos/dto/create-processo.dto.ts
var import_zod3 = require("zod");
var createProcessoSchema = import_zod3.z.object({
  // --- DADOS DO CLIENTE ---
  clienteNome: import_zod3.z.string().min(3, "Nome do cliente \xE9 obrigat\xF3rio"),
  // NOVO: Telefone é obrigatório para fazer o vínculo/criação do cliente
  clienteTelefone: import_zod3.z.string().min(8, "Telefone \xE9 obrigat\xF3rio"),
  // CPF e Email continuam opcionais com preprocessamento
  clienteEmail: import_zod3.z.preprocess(
    (val) => val === "" ? void 0 : val,
    import_zod3.z.string().email("E-mail inv\xE1lido").optional().nullable()
  ),
  clienteCpf: import_zod3.z.preprocess(
    (val) => val === "" ? void 0 : val,
    import_zod3.z.string().optional().nullable()
  ),
  // --- DADOS DO PROCESSO ---
  descricaoObjeto: import_zod3.z.string(),
  numeroInterno: import_zod3.z.string().optional(),
  numeroProcesso: import_zod3.z.preprocess(
    (val) => val === "" ? void 0 : val,
    import_zod3.z.string().optional().nullable()
  ),
  responsavel: import_zod3.z.enum(["Leonardo", "Alberto", "Jenifer"]),
  tipoHonorarios: import_zod3.z.enum(["Iniciais", "\xCAxito", "Ambos"]),
  valorPrevistoIniciais: import_zod3.z.number().default(0),
  valorPrevistoExito: import_zod3.z.number().default(0),
  basePrevisao: import_zod3.z.string().optional().nullable(),
  dataEstimadaRecebimento: import_zod3.z.preprocess(
    (val) => val === "" ? null : val,
    // Trata string vazia como null
    import_zod3.z.coerce.date().optional().nullable()
    // Aceita string ISO e vira Date
  ),
  custosPrevistos: import_zod3.z.number().default(0),
  dataFechamentoContrato: import_zod3.z.coerce.date(),
  // Aceita string ISO
  statusProtocolamento: import_zod3.z.string().default("Pendente de Protocolamento"),
  statusGeral: import_zod3.z.string().default("Contrato Fechado"),
  // --- NOVO: ARQUIVOS ---
  arquivos: import_zod3.z.array(import_zod3.z.object({
    tipo: import_zod3.z.string(),
    url: import_zod3.z.string(),
    nomeArquivo: import_zod3.z.string()
  })).optional().default([])
});

// src/modules/processos/processos.module.ts
var import_zod4 = __toESM(require("zod"), 1);

// src/modules/processos/create-processo.service.ts
var CreateProcessoFromConversationService = class {
  async execute(conversationId, userId) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        documents: true
      }
    });
    if (!conversation) throw new Error("Conversa n\xE3o encontrada.");
    const dados = conversation.tempData || {};
    const nomeFinal = this.clean(dados.extracted_RG_nome) || this.clean(dados.extracted_CNH_nome) || conversation.customerName || "Cliente sem Nome";
    const cpfFinal = this.clean(dados.extracted_RG_cpf) || this.clean(dados.extracted_CNH_cpf) || this.clean(dados.extracted_CPF_numero);
    const enderecoFinal = this.clean(dados.extracted_COMP_RES_endereco) || this.clean(dados.extracted_RG_endereco);
    let cliente;
    if (cpfFinal) {
      cliente = await prisma.cliente.upsert({
        where: { cpf: cpfFinal },
        update: {
          nome: nomeFinal,
          telefone: conversation.customerPhone,
          endereco: enderecoFinal
        },
        create: {
          nome: nomeFinal,
          cpf: cpfFinal,
          telefone: conversation.customerPhone,
          endereco: enderecoFinal
        }
      });
    } else {
      cliente = await prisma.cliente.upsert({
        where: { telefone: conversation.customerPhone },
        update: { nome: nomeFinal, endereco: enderecoFinal },
        create: {
          nome: nomeFinal,
          telefone: conversation.customerPhone,
          endereco: enderecoFinal
        }
      });
    }
    const descricao = `[ORIGEM: WHATSAPP]
    R\xE9u: ${dados.empresa || "N\xE3o informado"}
    Data: ${dados.data_do_ocorrido || "N\xE3o informada"}
    Relato: ${dados.dinamica_do_dano || "Sem relato"}
    Preju\xEDzo: ${dados.prejuizo || "Sem preju\xEDzo relatado"}`;
    const novoProcesso = await prisma.processo.create({
      data: {
        // Vínculos
        clienteId: cliente.id,
        userId,
        // Advogado responsável (quem clicou no botão ou o bot)
        // Dados Cache (para compatibilidade com seu front atual)
        clienteNome: cliente.nome,
        clienteCpf: cliente.cpf,
        clienteEmail: cliente.email,
        // Dados Jurídicos
        descricaoObjeto: descricao,
        numeroProcesso: null,
        // Ainda não ajuizado
        responsavel: "A Definir",
        // Ou pegar do userId
        tipoHonorarios: "A Definir",
        statusGeral: "Triagem Bot",
        // Datas
        dataFechamentoContrato: /* @__PURE__ */ new Date()
      }
    });
    const docsValidos = conversation.documents.filter((d) => d.mediaUrl);
    if (docsValidos.length > 0) {
      await prisma.processoArquivo.createMany({
        data: docsValidos.map((doc) => ({
          processoId: novoProcesso.id,
          tipo: doc.tipo,
          // RG, COMP_RES, PROVAS...
          url: doc.mediaUrl,
          nomeArquivo: doc.fileName || `doc_${Date.now()}`
        }))
      });
    }
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        workflowStep: "FINALIZADO",
        tags: { push: "PROCESSADO" }
      }
    });
    return novoProcesso;
  }
  // Helper para limpar "null", "undefined" ou strings vazias
  clean(val) {
    if (!val) return null;
    const str = String(val).trim();
    if (str.toLowerCase() === "null" || str.toLowerCase() === "undefined" || str === "") return null;
    return str;
  }
};

// src/modules/processos/processos.controller.ts
var ProcessosController = class {
  // Rota: POST /processos/gerar-pela-conversa/:id
  async gerarPelaConversa(req, rep) {
    const { id } = req.params;
    const userId = "ID_DO_ADVOGADO_PADRAO";
    const service = new CreateProcessoFromConversationService();
    try {
      console.log(`\u2699\uFE0F Gerando processo a partir da conversa ${id}...`);
      const resultado = await service.execute(id, userId);
      return rep.status(201).send(resultado);
    } catch (error) {
      console.error(error);
      return rep.status(500).send({
        error: "Erro ao gerar processo",
        message: error.message
      });
    }
  }
};

// src/modules/processos/processos.module.ts
async function processosModule(app2) {
  const service = new ProcessosService();
  const controller = new ProcessosController();
  app2.register(async (group) => {
    group.addHook("preHandler", app2.authenticate);
    group.get("/", async (req) => service.list(req.user.sub, false));
    group.get("/arquivados", async (req) => service.list(req.user.sub, true));
    group.get("/:id", async (req) => service.findById(req.params.id, req.user.sub));
    group.post("/", async (req, rep) => {
      try {
        const data = createProcessoSchema.parse(req.body);
        const processo = await service.create(data, req.user.sub);
        return rep.status(201).send(processo);
      } catch (error) {
        return rep.status(400).send({
          error: "Erro de Valida\xE7\xE3o",
          details: error.issues || error.message
        });
      }
    });
    group.get("/:id/andamentos", async (req, rep) => {
      const { id } = req.params;
      const andamentos = await service.listAndamentos(id, req.user.sub);
      return rep.send(andamentos);
    });
    group.put("/:id", async (req, rep) => {
      const { id } = req.params;
      const body = createProcessoSchema.partial().parse(req.body);
      try {
        const atualizado = await service.update(id, req.user.sub, body);
        return rep.send(atualizado);
      } catch (error) {
        return rep.status(400).send({ error: error.message });
      }
    });
    group.post("/:id/andamentos", async (req, rep) => {
      const { id } = req.params;
      const bodySchema = import_zod4.default.object({
        tipo: import_zod4.default.string(),
        // Front manda "tipo"
        descricao: import_zod4.default.string()
        // Front manda "descricao"
      });
      const body = bodySchema.parse(req.body);
      const novoAndamento = await service.createAndamento(id, req.user.sub, body);
      return rep.status(201).send(novoAndamento);
    });
    group.post("/gerar-pela-conversa/:id", (req, rep) => controller.gerarPelaConversa(req, rep));
    group.put("/:id/arquivar", async (req) => service.setArquivado(req.params.id, req.user.sub, true));
    group.put("/:id/desarquivar", async (req) => service.setArquivado(req.params.id, req.user.sub, false));
  }, { prefix: "/processos" });
}

// src/modules/users/users.service.ts
var UsersService = class {
  // Busca o perfil do usuário logado
  async getProfile(id) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        email: true,
        tipo: true,
        cpf: true,
        telefone: true,
        createdAt: true
      }
    });
    if (!user) throw new Error("Usu\xE1rio n\xE3o encontrado.");
    return user;
  }
  // Lista todos os usuários (útil para o Admin ver advogados/clientes)
  async listAll() {
    return await prisma.user.findMany({
      select: {
        id: true,
        nome: true,
        email: true,
        tipo: true,
        telefone: true
      },
      orderBy: { nome: "asc" }
    });
  }
  // Busca advogados específicos para o select de "Responsável" no cadastro de processos
  async listLawyers() {
    return await prisma.user.findMany({
      where: {
        tipo: { in: ["advogado_admin", "advogado"] }
      },
      select: { id: true, nome: true }
    });
  }
};

// src/modules/users/users.module.ts
async function usersModule(app2) {
  const service = new UsersService();
  app2.register(async (group) => {
    group.addHook("preHandler", app2.authenticate);
    group.get("/me", async (req) => {
      return service.getProfile(req.user.sub);
    });
    group.get("/", async (req, rep) => {
      if (req.user.tipo !== "advogado_admin") {
        return rep.status(403).send({ message: "Acesso negado." });
      }
      return service.listAll();
    });
    group.get("/lawyers", async () => service.listLawyers());
  }, { prefix: "/users" });
}

// src/modules/agenda/notify-daily-agenda.service.ts
var NotifyDailyAgendaService = class {
  // Removido o 'typeof prisma' do construtor para usar a instância global diretamente se preferir, 
  // ou mantendo a injeção para facilitar testes unitários.
  constructor(mailService2) {
    this.mailService = mailService2;
  }
  async execute() {
    const amanha = /* @__PURE__ */ new Date();
    amanha.setDate(amanha.getDate() + 1);
    amanha.setHours(0, 0, 0, 0);
    const depoisDeAmanha = new Date(amanha);
    depoisDeAmanha.setDate(depoisDeAmanha.getDate() + 1);
    const compromissos = await prisma.compromisso.findMany({
      where: {
        startDate: {
          gte: amanha,
          lt: depoisDeAmanha
        }
      },
      include: {
        user: true
        // Essencial para pegar o e-mail e nome do Dr.
      }
    });
    const agendaPorAdvogado = {};
    compromissos.forEach((comp) => {
      const email = comp.user.email;
      if (!agendaPorAdvogado[email]) {
        agendaPorAdvogado[email] = { nome: comp.user.nome, itens: [] };
      }
      agendaPorAdvogado[email].itens.push(comp);
    });
    for (const [email, dados] of Object.entries(agendaPorAdvogado)) {
      const { nome, itens } = dados;
      const listaHtml = itens.map((i) => `
          <li style="margin-bottom: 8px;">
            <strong style="color: #2c3e50;">${new Date(i.startDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</strong> - ${i.title}
          </li>
        `).join("");
      const html = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
          <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">Ol\xE1, Dr(a). ${nome}</h2>
          <p>Este \xE9 o seu resumo de compromissos para amanh\xE3, <strong>${amanha.toLocaleDateString("pt-BR")}</strong>:</p>
          <ul style="list-style: none; padding-left: 0;">
            ${listaHtml}
          </ul>
          <p style="margin-top: 20px;">Desejamos um excelente dia de trabalho!</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <small style="color: #95a5a6; display: block; text-align: center;">Nobre Gestor Jur\xEDdico - Automa\xE7\xE3o de Agenda</small>
        </div>
      `;
      await this.mailService.sendEmail(email, `\u{1F4C5} Sua Agenda: ${amanha.toLocaleDateString("pt-BR")}`, html);
    }
  }
};

// src/infra/services/chatbot-service.ts
var import_ai = require("ai");
var import_groq = require("@ai-sdk/groq");
var import_zod5 = require("zod");

// src/infra/services/zapsign-service.ts
var import_axios = __toESM(require("axios"), 1);
var ZapSignService = class {
  // ⚠️ Adicione ZAPSIGN_TOKEN no seu .env
  token = process.env.ZAPSIGN_TOKEN;
  apiUrl = "https://api.zapsign.com.br/api/v1";
  async criarContrato(nomeCliente, templateId, emailCliente = "email@padrao.com") {
    try {
      const payload = {
        template_id: templateId,
        signer_name: nomeCliente,
        send_automatic_email: false,
        send_automatic_whatsapp: false,
        lang: "pt-br",
        signers: [
          {
            name: nomeCliente,
            email: emailCliente,
            auth_mode: "assinaturaTela",
            send_automatic_email: false,
            send_automatic_whatsapp: false
          }
        ]
      };
      const response = await import_axios.default.post(`${this.apiUrl}/models/create-doc/`, payload, {
        headers: {
          "Authorization": `Bearer ${this.token}`,
          "Content-Type": "application/json"
        }
      });
      return {
        docId: response.data.doc_token,
        linkAssinatura: response.data.signers[0].sign_url
      };
    } catch (error) {
      console.error("Erro ZapSign:", error.response?.data || error.message);
      throw new Error("Falha ao gerar contrato na ZapSign");
    }
  }
};

// src/infra/services/policy/greeting.util.ts
function detectGreeting(texto) {
  const normalizado = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
  const saudacoes = [
    "oi",
    "ola",
    "ol\xE1",
    "bom dia",
    "boa tarde",
    "boa noite"
  ];
  const variacoesTudoBem = [
    "tudo bem",
    "td bem",
    "tudo bom",
    "tudo certo",
    "tudo ok",
    "tudo joia",
    "tudo joia",
    "como vai",
    "como vc ta",
    "como voce ta",
    "como voce esta"
  ];
  const palavrasBloqueadas = [
    "advogado",
    "processo",
    "acao",
    "a\xE7\xE3o",
    "caso",
    "problema",
    "direito",
    "indenizacao",
    "indeniza\xE7\xE3o",
    "reclamacao",
    "reclama\xE7\xE3o",
    "contrato"
  ];
  const startsWithGreeting = saudacoes.some(
    (s) => normalizado.startsWith(s)
  );
  const hasTudoBem = variacoesTudoBem.some(
    (v) => normalizado.includes(v)
  );
  const hasBlockedContext = palavrasBloqueadas.some(
    (p) => normalizado.includes(p)
  );
  const wordCount = normalizado.split(" ").length;
  const isPureGreeting = startsWithGreeting && wordCount <= 6 && !hasBlockedContext;
  return {
    isGreeting: startsWithGreeting,
    hasTudoBem,
    isPureGreeting
  };
}

// src/infra/services/chatbot-service.ts
var tipoCasoEnum = import_zod5.z.enum([
  "VOO",
  "BANCO",
  "SAUDE",
  "GERAL",
  "BPC",
  "INSS",
  "GOV"
]);
var atualizarEtapaSchema = import_zod5.z.object({}).catchall(import_zod5.z.any());
var PROXIMA_ETAPA_POR_FLUXO = {
  COLETA_FATOS: "COLETA_DOCS",
  COLETA_DOCS: "COLETA_DOCS_EXTRA",
  COLETA_DOCS_EXTRA: "ASSINATURA",
  ASSINATURA: "FINALIZADO",
  FINALIZADO: null
};
var atualizarEtapaTool = (0, import_ai.tool)({
  description: "Avan\xE7a o workflow para a pr\xF3xima etapa l\xF3gica",
  inputSchema: import_zod5.z.object({}),
  execute: async () => {
  }
});
var registrarFatosSchema = import_zod5.z.object({
  dinamica_do_dano: import_zod5.z.string().min(30, "Descreva o ocorrido com mais detalhes").describe(
    "Descri\xE7\xE3o detalhada do que aconteceu, incluindo contexto, dura\xE7\xE3o, transtornos e consequ\xEAncias pr\xE1ticas"
  ),
  empresa: import_zod5.z.string().min(2).describe("Nome da empresa respons\xE1vel pelo ocorrido"),
  data_do_ocorrido: import_zod5.z.string().describe("Data ou per\xEDodo aproximado do ocorrido"),
  prejuizo: import_zod5.z.string().min(10).describe(
    "Descri\xE7\xE3o dos preju\xEDzos financeiros, profissionais ou pessoais sofridos"
  )
});
var definirTipoCasoSchema = import_zod5.z.object({
  tipoCaso: tipoCasoEnum.describe(
    "Classifica\xE7\xE3o principal do caso jur\xEDdico com base no relato do cliente"
  )
});
var definirTipoCasoTool = (0, import_ai.tool)({
  description: "Define o tipo principal do caso jur\xEDdico",
  inputSchema: definirTipoCasoSchema,
  execute: async () => {
  }
});
var registrarFatosTool = (0, import_ai.tool)({
  description: "Registra fatos jur\xEDdicos narrados pelo cliente",
  inputSchema: registrarFatosSchema,
  // execute: async (input) => input,
  execute: async () => {
  }
});
function getSaudacaoAtual() {
  const horas = (/* @__PURE__ */ new Date()).getHours();
  if (horas < 12) return "Bom dia";
  if (horas < 18) return "Boa tarde";
  return "Boa noite";
}
function assertConversation(conversation) {
  if (!conversation) {
    throw new Error("Conversa n\xE3o encontrada");
  }
}
async function classificarTipoCasoPorFatos(fatos) {
  const { text } = await (0, import_ai.generateText)({
    model: (0, import_groq.groq)("llama-3.3-70b-versatile"),
    temperature: 0,
    system: `
Voc\xEA \xE9 um classificador jur\xEDdico.
Com base nos fatos fornecidos, classifique o tipo do caso.

RETORNE APENAS UMA DAS OP\xC7\xD5ES ABAIXO (sem explica\xE7\xF5es):
- VOO
- BANCO
- SAUDE
- BPC
- INSS
- GOV
- GERAL

REGRAS:
- Atraso, cancelamento, overbooking, bagagem \u2192 VOO
- Conta bloqueada, banco, cart\xE3o, Pix \u2192 BANCO
- Plano de sa\xFAde, tratamento, negativa \u2192 SAUDE
- Benef\xEDcio assistencial, defici\xEAncia, baixa renda \u2192 BPC
- Aposentadoria, aux\xEDlio, INSS \u2192 INSS
- GOV.BR, servi\xE7os p\xFAblicos digitais \u2192 GOV
- D\xFAvida ou gen\xE9rico \u2192 GERAL
`,
    prompt: `
FATOS:
${JSON.stringify(fatos)}
`
  });
  const tipo = text?.trim().toUpperCase();
  const permitidos = [
    "VOO",
    "BANCO",
    "SAUDE",
    "BPC",
    "INSS",
    "GOV",
    "GERAL"
  ];
  return permitidos.includes(tipo) ? tipo : "GERAL";
}
function gerarMensagemDocsExtras(tipoCaso) {
  const checklist = CHECKLISTS[tipoCaso] ?? [];
  if (!checklist.length) {
    return `
Perfeito, agora voc\xEA pode enviar qualquer outra prova que considere importante.

Pode ser foto, v\xEDdeo, \xE1udio, PDF ou print.
Quando terminar, \xE9 s\xF3 digitar *FINALIZAR*.
`.trim();
  }
  const itens = checklist.map((doc) => `\u2022 ${doc.descricao}`).join("\n");
  return `
Perfeito, agora voc\xEA pode enviar *outras provas* para refor\xE7ar seu caso.

Costuma ajudar bastante:
${itens}

Pode enviar fotos, PDFs, \xE1udios ou v\xEDdeos.
Quando terminar, \xE9 s\xF3 digitar *FINALIZAR*.
`.trim();
}
var DOCUMENTOS_BASE = [
  { codigo: "RG", descricao: "RG ou CNH (Frente e Verso ou inteiro)" },
  { codigo: "COMP_RES", descricao: "Comprovante de resid\xEAncia" }
];
var CHECKLISTS = {
  VOO: [
    { codigo: "PASSAGEM", descricao: "Passagens a\xE9reas" },
    { codigo: "ATRASO", descricao: "Comprovante do atraso/cancelamento" },
    { codigo: "GASTOS", descricao: "Gastos extras" }
  ],
  BANCO: [
    { codigo: "EXTRATO", descricao: "Extratos banc\xE1rios" },
    { codigo: "BLOQUEIO", descricao: "Print do bloqueio" }
  ],
  SAUDE: [
    { codigo: "CARTEIRINHA", descricao: "Carteirinha do plano" },
    { codigo: "LAUDO", descricao: "Laudo m\xE9dico", sensivel: true },
    { codigo: "NEGATIVA", descricao: "Negativa do plano" }
  ],
  GERAL: [
    { codigo: "RG", descricao: "RG ou CNH" },
    { codigo: "COMP_RES", descricao: "Comprovante de resid\xEAncia" }
  ],
  BPC: [
    { codigo: "RG", descricao: "RG ou CNH" },
    { codigo: "CPF", descricao: "CPF" },
    { codigo: "CADUNICO", descricao: "Folha do Cad\xDAnico" },
    { codigo: "LAUDO", descricao: "Laudo m\xE9dico", sensivel: true }
  ],
  INSS: [{ codigo: "RG", descricao: "RG ou CNH" }],
  GOV: [
    { codigo: "RG", descricao: "RG ou CNH" },
    { codigo: "GOVBR", descricao: "Print da conta GOV.BR" }
  ]
};
var ChatbotService = class {
  zapSignService = new ZapSignService();
  //  private groqClient = new Groq({
  //   apiKey: process.env.GROQ_API_KEY!,
  // });
  constructor() {
  }
  async chat(message, customerPhone) {
    let conversation = await prisma.conversation.findUnique({
      where: { customerPhone }
    });
    assertConversation(conversation);
    const texto = message.trim();
    const agora = /* @__PURE__ */ new Date();
    if (texto.toLowerCase() === "/deletar") {
      await prisma.conversationDocument.deleteMany({
        where: { conversationId: conversation.id }
      });
      await prisma.conversation.delete({
        where: { customerPhone }
      });
      return "\u267B\uFE0F *Hist\xF3rico resetado!* Seus dados e documentos foram apagados. Voc\xEA j\xE1 pode enviar um 'Oi' para iniciar um novo teste.";
    }
    let estadoAtual = conversation.workflowStep;
    let tipoCaso = conversation.tipoCaso ?? "GERAL";
    const jaApresentado = !!conversation.presentedAt;
    const { isGreeting, isPureGreeting } = detectGreeting(texto);
    const documentosRecebidos = await prisma.conversationDocument.findMany({
      where: {
        conversationId: conversation.id,
        etapa: "ESSENCIAL",
        validado: true
      },
      select: {
        tipo: true
      }
    });
    const documentosRecebidosCodigos = documentosRecebidos.map(
      (d) => d.tipo.toUpperCase()
    );
    const documentosBasePendentes = DOCUMENTOS_BASE.filter(
      (doc) => !documentosRecebidosCodigos.includes(doc.codigo)
    );
    const documentosCaso = CHECKLISTS[tipoCaso] ?? [];
    const documentosCasoPendentes = documentosCaso.filter(
      (doc) => !documentosRecebidosCodigos.includes(doc.codigo)
    );
    const documentosPendentesAtuais = documentosBasePendentes.length > 0 ? documentosBasePendentes : documentosCasoPendentes;
    const buildContext = (conv) => ({
      estadoAtual,
      tipoCaso,
      documentosFaltantes: documentosPendentesAtuais.map((d) => d.descricao),
      documentosEsperadosAgora: documentosPendentesAtuais.map((d) => d.descricao),
      presentedAt: conv.presentedAt,
      saudacaoTempo: getSaudacaoAtual()
    });
    if (isGreeting && isPureGreeting) {
      if (!jaApresentado) {
        await prisma.conversation.update({
          where: { customerPhone },
          data: { presentedAt: agora }
        });
        return this.responder({
          intent: "APRESENTACAO_INICIAL",
          conversation: buildContext(conversation),
          contexto: { saudacaoTempo: getSaudacaoAtual() }
        });
      }
      return this.responder({
        intent: "SAUDACAO_RETORNO",
        contexto: { nome: conversation.customerName },
        conversation: buildContext(conversation)
      });
    }
    const historico = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 12
    });
    if (documentosRecebidos.length > 0 && estadoAtual === "COLETA_DOCS") {
      if (documentosPendentesAtuais.length === 0) {
        await prisma.conversation.update({
          where: { customerPhone },
          data: { workflowStep: "COLETA_DOCS_EXTRA" }
        });
        estadoAtual = "COLETA_DOCS_EXTRA";
        conversation = await prisma.conversation.findUnique({
          where: { customerPhone }
        });
        const fatos2 = conversation.tempData;
        const temDinamica = !!fatos2?.dinamica_do_dano;
        const temEmpresa = !!fatos2?.empresa;
        const temData = !!fatos2?.data_do_ocorrido;
        const temPrejuizo = !!fatos2?.prejuizo;
        if (!conversation.tipoCaso && temDinamica && temEmpresa && temData && temPrejuizo) {
          const tipoInferido = await classificarTipoCasoPorFatos(fatos2);
          await prisma.conversation.update({
            where: { customerPhone },
            data: { tipoCaso: tipoInferido }
          });
          conversation = await prisma.conversation.findUnique({
            where: { customerPhone }
          });
          tipoCaso = tipoInferido;
        }
        return gerarMensagemDocsExtras(tipoCaso);
      }
      return `Documento recebido!   
Agora preciso de: *${documentosPendentesAtuais.map((d) => d.descricao).join(", ")}*.`;
    }
    if (estadoAtual === "COLETA_DOCS_EXTRA") {
      if (texto.toUpperCase().includes("FINALIZAR")) {
        await prisma.conversation.update({
          where: { customerPhone },
          data: { workflowStep: "ASSINATURA" }
        });
        return `
Perfeito! Recebemos todas as provas!  

Agora um advogado ir\xE1 analisar seu caso e entrar em contato com voc\xEA.
`.trim();
      }
      if (documentosRecebidos.length > 0) {
        return "Arquivo recebido! Pode enviar mais ou digitar *FINALIZAR* quando terminar.";
      }
      return "Fico no aguardo. Pode enviar mais provas ou digitar *FINALIZAR*.";
    }
    const messages = historico.filter((m) => m.type === "text" && typeof m.content === "string").map((m) => ({
      role: m.role === "USER" ? "user" : "assistant",
      content: m.content
    }));
    const result = await (0, import_ai.generateText)({
      model: (0, import_groq.groq)("llama-3.3-70b-versatile"),
      system: this.buildSystemPrompt(buildContext(conversation)),
      messages,
      tools: {
        atualizarEtapa: atualizarEtapaTool,
        registrarFatos: registrarFatosTool,
        definirTipoCaso: definirTipoCasoTool
      },
      toolChoice: "auto"
    });
    const toolCalls = result.toolCalls?.filter(
      (tc) => ["registrarFatos", "atualizarEtapa", "definirTipoCaso"].includes(tc.toolName)
    ) ?? [];
    let textoResposta = result.text ?? "";
    if (textoResposta) {
      textoResposta = textoResposta.replace(/<function=[\s\S]*?<\/function>/g, "").replace(/<tool_code>[\s\S]*?<\/tool_code>/g, "").trim();
    }
    console.log("[DEBUG] IA FALA:", textoResposta);
    const callTipoCaso = toolCalls.find(
      (t) => t.toolName === "definirTipoCaso"
    );
    if (callTipoCaso) {
      const rawArgs = callTipoCaso.args ?? {};
      const args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
      await prisma.conversation.update({
        where: { customerPhone },
        data: {
          tipoCaso: args.tipoCaso
        }
      });
      tipoCaso = args.tipoCaso;
    }
    if (toolCalls.length > 0) {
      const callRegistrar = toolCalls.find((t) => t.toolName === "registrarFatos");
      const callAtualizar = toolCalls.find((t) => t.toolName === "atualizarEtapa");
      if (callRegistrar) {
        const rawArgs = callRegistrar.args ?? callRegistrar.input ?? {};
        const args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
        console.log("[DEBUG] Salvando Fatos:", args);
        const parsed = registrarFatosSchema.safeParse(args);
        if (!parsed.success) {
          console.warn("[IA tentou registrar fatos incompletos]", parsed.error);
          return this.responder({
            intent: "AGUARDAR_RESPOSTA",
            conversation: buildContext(conversation)
          });
        }
        await prisma.conversation.update({
          where: { customerPhone },
          data: {
            tempData: {
              ...conversation.tempData ?? {},
              ...args
            }
          }
        });
        conversation = await prisma.conversation.findUnique({
          where: { customerPhone }
        });
        const fatos2 = conversation.tempData;
        const temDinamica = !!fatos2?.dinamica_do_dano;
        const temEmpresa = !!fatos2?.empresa;
        const temData = !!fatos2?.data_do_ocorrido;
        const temPrejuizo = !!fatos2?.prejuizo;
        if (conversation.workflowStep === "COLETA_FATOS" && temDinamica && temEmpresa && temData && temPrejuizo) {
          await prisma.conversation.update({
            where: { customerPhone },
            data: {
              workflowStep: "COLETA_DOCS",
              tempData: {
                ...conversation.tempData ?? {},
                aguardandoDocumentos: true
              }
            }
          });
          estadoAtual = "COLETA_DOCS";
          return this.responder({
            intent: "TRANSICAO_ETAPA",
            conversation: {
              estadoAtual: "COLETA_DOCS",
              tipoCaso,
              documentosFaltantes: documentosPendentesAtuais.map((d) => d.descricao),
              presentedAt: conversation.presentedAt,
              tempData: conversation.tempData
            }
          });
        }
      }
      if (callAtualizar) {
        console.log("[DEBUG] Atualizando Etapa via Tool");
        const proximaEtapa = PROXIMA_ETAPA_POR_FLUXO[estadoAtual];
        if (proximaEtapa) {
          await prisma.conversation.update({
            where: { customerPhone },
            data: { workflowStep: proximaEtapa }
          });
          return this.responder({
            intent: "TRANSICAO_ETAPA",
            conversation: {
              estadoAtual: proximaEtapa,
              tipoCaso,
              documentosFaltantes: documentosPendentesAtuais.map((d) => d.descricao),
              presentedAt: conversation.presentedAt,
              tempData: conversation.tempData
            }
          });
        }
      }
    }
    const fatos = conversation.tempData;
    const coletaFatosCompleta = estadoAtual === "COLETA_FATOS" && fatos?.dinamica_do_dano && fatos?.empresa && fatos?.data_do_ocorrido && fatos?.prejuizo;
    if (coletaFatosCompleta && toolCalls.length === 0) {
      const proximaEtapa = PROXIMA_ETAPA_POR_FLUXO[estadoAtual];
      if (proximaEtapa) {
        await prisma.conversation.update({
          where: { customerPhone },
          data: { workflowStep: proximaEtapa }
        });
        return this.responder({
          intent: "TRANSICAO_ETAPA",
          conversation: {
            estadoAtual: proximaEtapa,
            tipoCaso,
            documentosFaltantes: documentosPendentesAtuais.map((d) => d.descricao),
            presentedAt: conversation.presentedAt
          }
        });
      }
    }
    if (!textoResposta) {
      return this.responder({
        intent: "AGUARDAR_RESPOSTA",
        conversation: buildContext(conversation)
      });
    }
    return textoResposta;
  }
  /* ---------------------------------
     PROMPT
  --------------------------------- */
  //   private buildSystemPrompt(context: {
  //     estadoAtual: WorkflowStep;
  //     tipoCaso: TipoCaso;
  //     documentosFaltantes: string[];
  //     documentosEsperadosAgora: string[];
  //     presentedAt: Date | null;
  //     saudacaoTempo?: string;
  //     fatos?: any;
  //   }) {
  //     return `
  // VOCÊ É Carol, advogada do escritório RCS Advocacia.
  // CONTEXTO CRÍTICO:
  // - Apresentação já realizada: ${context.presentedAt ? 'SIM' : 'NÃO'}
  // - Saudação do Horário Atual: "${context.saudacaoTempo || 'Olá'}" (USE ESTA).
  // - Fatos Coletados: ${JSON.stringify(context.fatos || {})}
  // REGRAS ABSOLUTAS DE APRESENTAÇÃO:
  // - A apresentação ("Me chamo Carol...", "sou advogada...") só pode ocorrer UMA ÚNICA VEZ em toda a conversa.
  // - Se "Apresentação já realizada" for SIM, é PROIBIDO repetir qualquer forma de apresentação.
  // - Se o cliente já iniciou ou descreveu um problema, é PROIBIDO perguntar "como posso ajudar" ou pedir o nome.
  // - Se a conversa já possui histórico, NÃO se comporte como primeira interação.
  // MEMÓRIA:
  // - Você recebe TODO o histórico da conversa.
  // - NÃO repita informações, perguntas ou saudações já feitas.
  // - Continue a conversa exatamente de onde ela parou.
  // APRESENTACAO_INICIAL (somente se Apresentação já realizada = NÃO):
  // - Cumprimente de acordo com o horário.
  // - Use EXATAMENTE a saudação: "${context.saudacaoTempo || 'Olá'}".
  // - Diga: "Me chamo Carol, sou advogada do escritório RCS Advocacia".
  // - Pergunte se está tudo bem.
  // - Pergunte o nome do cliente de forma natural (ex: "Como posso te chamar?").
  // - Máximo de 2 frases curtas.
  // - NÃO peça relato detalhado.
  // - NÃO peça documentos.
  // RITMO DE CONVERSA (OBRIGATÓRIO):
  // - Nunca solicite documentos logo após uma saudação.
  // - Nunca combine acolhimento emocional + pedido de documento.
  // - Antes de qualquer solicitação, confirme entendimento.
  // - Explique brevemente o motivo de qualquer pedido.
  // COLETA_FATOS (CRITÉRIO RIGOROSO):
  // Para finalizar esta etapa e chamar 'atualizarEtapa', você precisa OBRIGATORIAMENTE de 3 pilares.
  // Analise o histórico e verifique mentalmente:
  // 1. [ ] DINÂMICA DO DANO (O que houve + Detalhe do prejuízo/transtorno)
  // 2. [ ] EMPRESA/RÉU (Quem causou)
  // 3. [ ] DATA DO OCORRIDO (Quando foi, mês/ano aproximado)
  // REGRA DE OURO ANTI-LOOP:
  // - Antes de responder, verifique quais itens acima JÁ FORAM informados.
  // - NUNCA pergunte algo que o usuário já respondeu ou que você já citou no resumo.
  // - Se o usuário já disse o nome da empresa, NÃO pergunte "Qual a empresa?".
  // - Se falta apenas a DATA, sua ÚNICA pergunta deve ser: "Entendi. E quando isso aconteceu?"
  // EXEMPLO DE RACIOCÍNIO:
  // - Tenho o problema? Sim.
  // - Tenho a empresa? Sim.
  // - Tenho a data? NÃO.
  // -> AÇÃO: Perguntar apenas a data.
  // SE O RELATO ESTIVER COMPLETO (Os 3 itens preenchidos):
  // - Não faça mais perguntas.
  // - CHAME A TOOL 'atualizarEtapa' IMEDIATAMENTE
  // Nesta etapa:
  // - Faça UMA pergunta por vez.
  // - Se faltar alguma informação, pergunte apenas sobre o ponto faltante.
  // - Não repita perguntas já respondidas.
  // - Qualquer resposta em TEXTO é considerada ERRO.
  // - A única resposta válida é chamar a tool "atualizarEtapa".
  // REGRA CRÍTICA DE TOOLS:
  // - A tool "atualizarEtapa" NÃO recebe parâmetros.
  // - Ela apenas sinaliza que a etapa atual foi concluída.
  // - A definição da próxima etapa é responsabilidade do sistema.
  // - Dados do caso devem ser enviados SOMENTE pela tool "registrarFatos".
  // - Nunca combine dados e transição na mesma tool.
  // TOM DE VOZ:
  // - Profissional, humano e acolhedor.
  // - Frases curtas.
  // - Sem emojis.
  // - Sem linguagem publicitária ou institucional.
  // SUA FUNÇÃO:
  // - Coletar informações iniciais do cliente.
  // - Organizar documentos.
  // - Encaminhar o caso para análise humana.
  // - NUNCA prestar aconselhamento jurídico.
  // REGRAS INEGOCIÁVEIS:
  // 1. NUNCA afirme ou sugira direito, ganho de causa ou indenização.
  // 2. NUNCA dê opinião jurídica, previsão de resultado ou valores.
  // 3. Para avançar etapas, VOCÊ DEVE chamar a tool "atualizarEtapa".
  // 4. NÃO avance etapas apenas com texto.
  // 5. Faça no máximo UMA pergunta objetiva por mensagem.
  // 6. Se a etapa atual estiver completa, CHAME a tool adequada.
  // 7. Dados sensíveis (ex: saúde): solicite APENAS documentos, nunca descrições.
  // VOCÊ NÃO DECIDE:
  // - Qual etapa vem a seguir.
  // - Se documentos são suficientes.
  // - Se o fluxo deve avançar sem tool.
  // FLUXO ATUAL:
  // - Etapa: ${context.estadoAtual}
  // - Tipo de caso: ${context.tipoCaso}
  // DOCUMENTOS PENDENTES:
  // ${context.documentosFaltantes.length ? context.documentosFaltantes.join(', ') : 'Nenhum'}
  // COMPORTAMENTO FINAL:
  // - Linguagem simples.
  // - Sem termos técnicos.
  // - Seja clara, educada e objetiva.
  // - Em caso de dúvida, peça esclarecimento antes de avançar.
  // FLUIDEZ OBRIGATÓRIA:
  // - Responda como uma conversa real de WhatsApp.
  // - Não antecipe perguntas.
  // - Sempre aguarde resposta antes de avançar.
  // - Nunca repita saudações já feitas.
  // `;
  //   }
  buildSystemPrompt(context) {
    const fatosTexto = context.fatos ? JSON.stringify(context.fatos) : "Nenhum fato registrado ainda.";
    const proximoDocumento = context.documentosFaltantes[0] || "os demais documentos";
    return `
# IDENTIDADE
Voc\xEA \xE9 Carol, advogada especialista em triagem do escrit\xF3rio RCS Advocacia.
Sua miss\xE3o \xE9 acolher o cliente, entender o problema e organizar a documenta\xE7\xE3o para a equipe jur\xEDdica.

# TOM DE VOZ E PERSONALIDADE (CR\xCDTICO)
- **Canal:** Voc\xEA est\xE1 no WhatsApp. Use linguagem natural, fluida e levemente informal (mas profissional).
- **Empatia:** Nunca seja fria. Se o cliente relatar um problema, valide o sentimento dele antes de pedir dados (Ex: "Imagino o transtorno que isso causou. Sinto muito.").
- **Clareza:** Evite "jurisdiqu\xEAs". Fale a l\xEDngua do cliente.
- **Formata\xE7\xE3o:** Use quebras de linha para n\xE3o criar "muros de texto".

# CONTEXTO ATUAL
- Etapa do Fluxo: ${context.estadoAtual}
- Cliente j\xE1 se apresentou? ${context.presentedAt ? "SIM" : "N\xC3O"}
- Sauda\xE7\xE3o do hor\xE1rio: "${context.saudacaoTempo || "Ol\xE1"}"
- Fatos j\xE1 entendidos (Mem\xF3ria): ${fatosTexto}
- **PR\xD3XIMO DOCUMENTO ALVO:** ${proximoDocumento}

---

# DIRETRIZES POR ETAPA

## 1. APRESENTA\xC7\xC3O (Se "Cliente j\xE1 se apresentou" = N\xC3O)
- Objetivo: Criar conex\xE3o.
- A\xE7\xE3o: Use a sauda\xE7\xE3o do hor\xE1rio. Diga seu nome e cargo ("sou advogada da RCS").
- Pergunta: Pergunte o nome do cliente ou como pode ajudar, de forma aberta.
- **Erro comum:** N\xE3o pe\xE7a relato detalhado ou documentos logo no "Oi".

## 2. COLETA DE FATOS (Se Etapa = COLETA_FATOS)
- Objetivo: Preencher as lacunas mentais: [FATO OCORRIDO], [EMPRESA], [DATA], [PREJUIZO].
- **T\xE9cnica de Ouro:** Valida\xE7\xE3o + Pergunta.
  - Ruim: "Qual a empresa?"
  - Bom: "Entendi, realmente \xE9 uma situa\xE7\xE3o frustrante esperar tanto. E qual foi a companhia a\xE9rea?"
- **Regra de Fluxo:** Pergunte UM dado por vez. N\xE3o bombardeie o cliente.
- **Intelig\xEAncia:** Se o cliente j\xE1 disse a data no texto anterior, N\xC3O PERGUNTE DE NOVO. Apenas confirme.
- **Fim da Etapa:** Se voc\xEA j\xE1 tem os 4 pilares (Fato Ocorrido, Empresa, Data, Preju\xEDzo), pare de perguntar e chame a tool 'atualizarEtapa'.
- \xC9 PROIBIDO chamar a tool "registrarFatos" se QUALQUER campo estiver incompleto.
- Nunca envie strings vazias.
- Se faltar qualquer informa\xE7\xE3o, fa\xE7a UMA pergunta objetiva e aguarde resposta.
- Apenas chame "registrarFatos" quando todos os campos estiverem totalmente preenchidos.

### REGRA CR\xCDTICA \u2013 REGISTRO DE FATOS (OBRIGAT\xD3RIO)

Ao chamar a tool "registrarFatos":

- N\xC3O resuma.
- N\xC3O use r\xF3tulos gen\xE9ricos como:
  "atraso de voo", "problema banc\xE1rio", "negativa do plano".

- A descri\xE7\xE3o DEVE conter:
  \u2022 o que aconteceu
  \u2022 por quanto tempo
  \u2022 impacto real na vida do cliente
  \u2022 consequ\xEAncias pr\xE1ticas (perda de tempo, compromisso, gastos, estresse)

Exemplo RUIM:
"atraso de voo"

Exemplo CORRETO:
"O voo sofreu atraso de aproximadamente 12 horas, fazendo com que o cliente permanecesse no aeroporto durante todo o per\xEDodo, perdendo uma reuni\xE3o profissional importante e enfrentando desgaste f\xEDsico e emocional."

CLASSIFICA\xC7\xC3O DO CASO (OBRIGAT\xD3RIO):

Assim que identificar claramente o tipo do caso, voc\xEA DEVE chamar a tool
"definirTipoCaso".

Exemplos:
- Atraso, cancelamento ou overbooking de voo \u2192 tipoCaso = VOO
- Bloqueio de conta ou problema banc\xE1rio \u2192 BANCO
- Negativa de plano ou tratamento \u2192 SAUDE

Se o tipo ainda n\xE3o estiver claro, N\xC3O chame a tool.
Nunca invente.

REGRA ABSOLUTA DE TOOLS:
- O nome da tool \xE9 EXATAMENTE: "registrarFatos"
- \xC9 PROIBIDO inventar, abreviar ou alterar o nome da tool
- NUNCA use: "regarFatos", "registrar_fatos", "salvarFatos"

## 3. TRANSI\xC7\xC3O E DOCUMENTOS (Se Etapa = COLETA_DOCS)

**CONTEXTO DESTE MOMENTO**
- O cliente ACABOU de relatar os fatos.
- Ele j\xE1 sabe que voc\xEA entendeu o caso.

**REGRAS ABSOLUTAS**
- N\xC3O reexplique o caso.
- N\xC3O fa\xE7a resumo longo.
- N\xC3O repita empresa, data ou din\xE2mica do dano.
- Use no m\xE1ximo **UMA frase curta** de confirma\xE7\xE3o
  (ex: "Perfeito, j\xE1 registrei tudo aqui.").

  ## 4. COLETA_DOCS_EXTRA
- Voc\xEA N\xC3O analisa arquivos
- Voc\xEA N\xC3O valida documentos
- Voc\xEA N\xC3O decide se algo \xE9 suficiente
- Apenas confirme recebimento
- Aguarde o cliente digitar "FINALIZAR"
- Nunca avance etapa por conta pr\xF3pria

**ROTEIRO OBRIGAT\xD3RIO**
1. Confirme o avan\xE7o de forma breve.
2. Solicite os documentos pendentes de forma clara e direta.
3. Liste apenas os documentos necess\xE1rios agora:
   ${context.documentosFaltantes.join(", ")}.

  
  **IMPORTANTE - PROCESSAMENTO DE ARQUIVOS:**
- Voc\xEA N\xC3O analisa arquivos nem imagens.
- O sistema avisar\xE1 quando um documento for validado.
- Seu papel \xE9 apenas pedir o pr\xF3ximo documento quando instru\xEDdo.
  - Ap\xF3s confirmar, PE\xC7A O PR\xD3XIMO DOCUMENTO: "${proximoDocumento}".

---

# LIMITES \xC9TICOS E T\xC9CNICOS (INVIOL\xC1VEIS)
1. **Promessas:** NUNCA garanta ganho de causa ou valores de indeniza\xE7\xE3o ("Voc\xEA vai ganhar X reais"). Diga "Vamos analisar a viabilidade".
2. **Consultoria:** N\xE3o tire d\xFAvidas jur\xEDdicas complexas. Seu foco \xE9 triagem.
3. **Tools:**
   - Use 'registrarFatos' para salvar dados novos.
   - Use 'atualizarEtapa' APENAS quando tiver certeza que a etapa atual acabou.
   - NUNCA avance de etapa apenas falando. Voc\xEA PRECISA chamar a tool.

# EXTREMAMENTE IMPORTANTE
- Se o usu\xE1rio estiver irritado, mantenha a calma e seja sol\xEDcita.

REGRAS DE SEGURAN\xC7A:
- Se "Fatos Coletados" j\xE1 tiver 3 itens preenchidos, N\xC3O fa\xE7a mais perguntas sobre o ocorrido. Pe\xE7a os documentos.
- Se o cliente disser apenas "Certo" ou "Ok" ap\xF3s voc\xEA pedir documentos, apenas reforce o pedido ou aguarde o upload.

Agora, responda \xE0 \xFAltima mensagem do cliente seguindo estas diretrizes.
`;
  }
  async responder(input) {
    const system = this.buildSystemPrompt({
      estadoAtual: input.conversation.estadoAtual,
      tipoCaso: input.conversation.tipoCaso,
      documentosFaltantes: input.conversation.documentosFaltantes,
      documentosEsperadosAgora: input.conversation.documentosEsperadosAgora ?? [],
      presentedAt: input.conversation.presentedAt,
      fatos: input.conversation.tempData
    });
    let mensagemInstrucao = JSON.stringify({
      intent: input.intent,
      contexto: input.contexto ?? {}
    });
    const { text } = await (0, import_ai.generateText)({
      model: (0, import_groq.groq)("llama-3.3-70b-versatile"),
      temperature: 0.3,
      // Temperatura baixa para ser obediente
      system,
      prompt: mensagemInstrucao
      // Envia a instrução forte em vez do JSON simples
    });
    let textoLimpo = text ?? "";
    if (textoLimpo) {
      textoLimpo = textoLimpo.replace(/<function=[\s\S]*?<\/function>/g, "").replace(/<tool_code>[\s\S]*?<\/tool_code>/g, "").trim();
    }
    return textoLimpo;
  }
  // // ======================================================
  // // 🎙️ TRANSCRIÇÃO DE ÁUDIO (WHATSAPP / PTT)
  // // ======================================================
  // async transcreverAudio(
  //   audioBuffer: Buffer,
  //   mimeType: string
  // ): Promise<string> {
  //   const file = new File(
  //     [audioBuffer],
  //     'audio.ogg',
  //     { type: mimeType }
  //   );
  //   const transcription =
  //     await this.groqClient.audio.transcriptions.create({
  //       file,
  //       model: 'whisper-large-v3',
  //       language: 'pt',
  //       response_format: 'json',
  //     });
  //   return transcription.text?.trim() || '';
  // }
};

// src/infra/services/storage.service.ts
var import_client_s3 = require("@aws-sdk/client-s3");
var import_crypto = require("crypto");
var StorageService = class {
  s3Client;
  bucketName;
  publicUrl;
  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    this.bucketName = process.env.R2_BUCKET_NAME || "advocacia-bot";
    this.publicUrl = process.env.R2_PUBLIC_URL || "https://pub-seu-hash.r2.dev";
    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error("Credenciais do Cloudflare R2 n\xE3o configuradas.");
    }
    this.s3Client = new import_client_s3.S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    });
  }
  /**
   * Faz upload de um buffer (imagem/pdf) para o R2
   * @param fileBuffer O buffer do arquivo
   * @param extension A extensão (ex: 'jpg', 'pdf')
   * @param folder Pasta opcional (ex: 'documentos')
   */
  async uploadFile(fileBuffer, extension, folder = "uploads") {
    const fileName = `${(0, import_crypto.randomUUID)()}.${extension}`;
    const key = `${folder}/${fileName}`;
    await this.s3Client.send(
      new import_client_s3.PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: this.getMimeType(extension)
      })
    );
    return {
      url: `${this.publicUrl}/${key}`,
      path: key,
      fileName
    };
  }
  getMimeType(extension) {
    const types = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      pdf: "application/pdf"
    };
    return types[extension] || "application/octet-stream";
  }
};

// src/modules/whatsapp/whatsapp.service.ts
var import_form_data = __toESM(require("form-data"), 1);
var import_node_fetch = __toESM(require("node-fetch"), 1);

// src/infra/services/document-analysis.service.ts
var import_google = require("@ai-sdk/google");
var import_ai2 = require("ai");
var import_zod6 = require("zod");
var google = (0, import_google.createGoogleGenerativeAI)({
  apiKey: process.env.GEMINI_API_KEY || ""
});
var DocumentAnalysisService = class {
  async analyzeDocument(fileBuffer, docTypeContext) {
    console.log(`\u{1F50D} [IA Vision] Analisando imagem como: ${docTypeContext}...`);
    try {
      const extractionSchema = import_zod6.z.object({
        tipo_identificado: import_zod6.z.enum(["RG", "CNH", "COMPROVANTE_RESIDENCIA", "OUTROS"]),
        nome_completo: import_zod6.z.string().optional(),
        rg_numero: import_zod6.z.string().optional().describe("N\xFAmero do Registro Geral (RG) ou n\xBA de registro da CNH"),
        cpf_numero: import_zod6.z.string().optional().describe("N\xFAmero do CPF (Cadastro de Pessoa F\xEDsica). Formato: xxx.xxx.xxx-xx"),
        endereco_completo: import_zod6.z.string().optional(),
        data_emissao: import_zod6.z.string().optional(),
        legivel: import_zod6.z.boolean().describe("Se o documento est\xE1 n\xEDtido e leg\xEDvel")
      });
      const { object } = await (0, import_ai2.generateObject)({
        model: google("gemini-2.5-flash"),
        schema: extractionSchema,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analise este documento (${docTypeContext}) com precis\xE3o para fins jur\xEDdicos.
                       
                       REGRAS DE EXTRA\xC7\xC3O:
                       1. NOME: Extraia o nome completo.
                       2. CPF: \xC9 CRUCIAL extrair o CPF. Procure por 11 d\xEDgitos, geralmente rotulado como CPF ou CIC.
                       3. RG: Extraia o n\xFAmero do registro geral separadamente.
                       
                       Se for CNH, o 'rg_numero' \xE9 o n\xFAmero do registro e o 'cpf_numero' fica abaixo.
                       Extraia tudo com pontua\xE7\xE3o se houver.`
              },
              { type: "image", image: fileBuffer }
            ]
          }
        ]
      });
      return object;
    } catch (error) {
      console.error("\u274C Erro na an\xE1lise de IA:", error);
      return null;
    }
  }
};

// src/infra/services/utils/documentos.ts
function normalizarTipoDocumento(tipo) {
  if (!tipo) return "";
  const t = tipo.toUpperCase();
  if (["RG", "RG_FRENTE", "RG_VERSO", "RG_FOTO"].includes(t)) return "RG";
  if (["CNH", "CNH_FRENTE", "CNH_VERSO", "CNH_FOTO"].includes(t)) return "CNH";
  if (["COMPROVANTE_RESIDENCIA", "COMPROVANTE_DE_RESIDENCIA", "ENDERECO"].includes(t)) {
    return "COMP_RES";
  }
  return t;
}

// src/modules/whatsapp/whatsapp.service.ts
var WhatsappService = class {
  constructor(app2, chatbotService) {
    this.app = app2;
    this.chatbotService = chatbotService;
    this.storageService = new StorageService();
    this.docAnalysisService = new DocumentAnalysisService();
  }
  version = "v19.0";
  baseUrl = `https://graph.facebook.com/${this.version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}`;
  token = process.env.WHATSAPP_ACCESS_TOKEN;
  storageService;
  // <--- Instância do Storage
  docAnalysisService;
  // ===========================================================================
  // 1. WEBHOOK (O CORAÇÃO DA MUDANÇA)
  // ===========================================================================
  // ===========================================================================
  // 1. WEBHOOK (CORREÇÃO DE FLUXO)
  // ===========================================================================
  async processWebhook(body) {
    const changes = body.entry?.[0]?.changes?.[0];
    if (!changes) return;
    const value = changes.value;
    const message = value.messages?.[0];
    const contactName = value.contacts?.[0]?.profile?.name || "Cliente WhatsApp";
    if (message) {
      await this.markAsRead(message.id);
      const conversation = await this.findOrCreateConversation(message.from, contactName);
      const mediaTypes = ["image", "document", "audio", "voice", "ptt"];
      const isMedia = mediaTypes.includes(message.type);
      if (isMedia) {
        console.log(`\u{1F4E5} M\xEDdia detectada de ${contactName}. Iniciando processamento...`);
        await this.handleIncomingMedia(message, conversation);
        return;
      }
      if (message.type !== "text") {
        console.log(`\u26A0\uFE0F Tipo de mensagem ignorado: ${message.type}`);
        return;
      }
      const content = message.text?.body || "";
      if (!content) return;
      const savedMessage = await prisma.message.create({
        data: {
          wa_id: message.id,
          content,
          role: "USER",
          type: "text",
          status: "read",
          conversationId: conversation.id
        }
      });
      await this.updateConversationStats(conversation.id, content);
      this.app.io.emit("new_whatsapp_message", { ...savedMessage, conversationId: conversation.id });
      if (!conversation.attendantId) {
        const aiResponse = await this.chatbotService.chat(content, message.from);
        if (aiResponse) {
          await this.sendText(message.from, aiResponse, conversation.id);
        }
      }
    }
  }
  // ===========================================================================
  // LÓGICA DE PROCESSAMENTO DE MÍDIA
  // ===========================================================================
  // private async handleIncomingMedia(message: IncomingMessage, conversation: any) {
  //   try {
  //     const etapasAceitas = ['COLETA_DOCS', 'COLETA_DOCS_EXTRA'];
  //     const workflowStep = conversation.workflowStep?.trim();
  //     if (!etapasAceitas.includes(workflowStep)) {
  //       await this.sendText(
  //         conversation.customerPhone,
  //         'Já recebi 👍 Vou analisar esse documento assim que chegarmos na etapa correta, tudo bem?',
  //         conversation.id
  //       );
  //       return;
  //     }
  //     // 1. [UX] Feedback Imediato: Avisa que recebeu antes de processar
  //     await this.sendText(
  //       conversation.customerPhone,
  //       "Recebi seu documento! \nEstou analisando a imagem para validar os dados, aguarde um instante...",
  //       conversation.id
  //     );
  //     // 2. Identificar ID e MimeType com Segurança
  //     let mediaId = '';
  //     let mimeType = '';
  //     let mediaType: 'image' | 'document' | 'audio' = 'document';
  //     let fileName = '';
  //     switch (message.type) {
  //       case 'image':
  //         mediaId = message.image?.id || '';
  //         mimeType = message.image?.mime_type || 'image/jpeg';
  //         mediaType = 'image';
  //         fileName = `imagem_${Date.now()}`;
  //         break;
  //       case 'document':
  //         mediaId = message.document?.id || '';
  //         mimeType = message.document?.mime_type || 'application/pdf';
  //         mediaType = 'document';
  //         fileName = message.document?.filename || `documento_${Date.now()}`;
  //         break;
  //       case 'audio':
  //       case 'voice':
  //       case 'ptt':
  //         mediaId = message.audio?.id || '';
  //         mimeType = message.audio?.mime_type || 'audio/ogg';
  //         mediaType = 'audio';
  //         fileName = `audio_${Date.now()}.ogg`;
  //         break;
  //     }
  //     // Se não for imagem nem documento (ex: áudio, sticker), ignora ou trata diferente
  //     if (!mediaId) return;
  //     // 3. Baixar buffer da Meta
  //     const fileBuffer = await this.downloadMediaFromMeta(mediaId);
  //     // 4. Descobrir contexto (O que falta?)
  //     const pendentes = await this.getDocumentosPendentes(conversation.id);
  //     // Se tiver pendências, assume que é a primeira. Se não, marca como EXTRA.
  //     const docTypeContext = pendentes[0] ?? 'DOCUMENTO_EXTRA';
  //     // 5. Upload R2
  //     const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  //     const folder = `clientes/${conversation.customerPhone}`;
  //     const uploadResult = await this.storageService.uploadFile(fileBuffer, extension, folder);
  //     // 6. Análise de IA (OCR)
  //     let analiseIA = null;
  //     if (docTypeContext !== 'DOCUMENTO_EXTRA') {
  //       analiseIA = await this.docAnalysisService.analyzeDocument(
  //         fileBuffer,
  //         docTypeContext
  //       );
  //     }
  //     // 7. Salvar na tabela ConversationDocument (Link para o advogado)
  //     const isExtra = docTypeContext === 'DOCUMENTO_EXTRA';
  //     await prisma.conversationDocument.create({
  //       data: {
  //         conversationId: conversation.id,
  //         tipo: isExtra ? 'DOCUMENTO' : docTypeContext,
  //         etapa: isExtra ? 'COMPLEMENTAR' : 'ESSENCIAL',
  //         mediaUrl: uploadResult.url,
  //         fileName: isExtra
  //           ? `extra_${Date.now()}.${extension}`
  //           : `${docTypeContext}.${extension}`,
  //         mimeType,
  //         validado: isExtra ? true : analiseIA?.legivel || false,
  //         extractedData: isExtra ? {} : analiseIA ?? {},
  //       }
  //     });
  //     // 8. Salvar dados extraídos SOMENTE se for documento obrigatório
  //     if (
  //       docTypeContext !== 'DOCUMENTO_EXTRA' &&
  //       analiseIA &&
  //       analiseIA.legivel
  //     ) {
  //       await prisma.conversation.update({
  //         where: { id: conversation.id },
  //         data: {
  //           tempData: {
  //             ...(conversation.tempData as object ?? {}),
  //             [`extracted_${docTypeContext}_nome`]: analiseIA.nome_completo,
  //             [`extracted_${docTypeContext}_rg`]: analiseIA.rg_numero,
  //             [`extracted_${docTypeContext}_cpf`]: analiseIA.cpf_numero,
  //             [`extracted_${docTypeContext}_endereco`]: analiseIA.endereco_completo,
  //             [`extracted_${docTypeContext}_legivel`]: true
  //           }
  //         }
  //       });
  //       console.log(`✅ Dados extraídos do ${docTypeContext}:`, analiseIA);
  //     }
  //     // 9. Registrar mensagem visual no chat (Para aparecer no front)
  //     const savedMessage = await prisma.message.create({
  //       data: {
  //         wa_id: message.id,
  //         content: uploadResult.url, // 🔥 URL do arquivo
  //         role: 'USER',
  //         type: mediaType,           // 'image' | 'document' | 'audio'
  //         status: 'read',
  //         conversationId: conversation.id,
  //         fileName: `${docTypeContext}.${extension}`,
  //       }
  //     });
  //     // Socket update
  //     this.app.io.emit('new_whatsapp_message', { ...savedMessage, conversationId: conversation.id });
  //     // 10. Construção do Prompt para o Bot
  //     let promptDoBot = '';
  //     if (docTypeContext === 'DOCUMENTO_EXTRA') {
  //       promptDoBot = `[SISTEMA]: O usuário enviou um documento complementar ao caso.
  // Agradeça o envio e diga que esse material ajudará a fortalecer a análise jurídica.
  // Pergunte se deseja enviar mais alguma prova ou se prefere finalizar digitando FINALIZAR.`;
  //     }
  //     if (analiseIA && !analiseIA.legivel) {
  //       // Cenário A: IA não conseguiu ler
  //       promptDoBot = `[SISTEMA]: O usuário enviou uma imagem do ${docTypeContext}, mas a IA Vision marcou como ILEGÍVEL/BORRADA. 
  //       Agradeça o envio, mas peça gentilmente para enviar uma foto mais nítida, sem reflexos e bem iluminada.`;
  //     }
  //     else if (analiseIA) {
  //       // Cenário B: IA leu com sucesso (Confirmação)
  //       // Formata os dados para o bot ler de forma limpa
  //       const dadosLidos = `
  //         - Nome: ${analiseIA.nome_completo || 'Não identificado'}
  //         - CPF: ${analiseIA.cpf_numero || 'Não identificado'}
  //         - RG: ${analiseIA.rg_numero || 'Não identificado'}
  //       `;
  //       promptDoBot = `[SISTEMA]: O usuário enviou o ${docTypeContext}.
  //       A IA leu os seguintes dados: ${dadosLidos}.
  //       AÇÃO: Agradeça e peça para o cliente CONFIRMAR se esses dados (Nome e CPF) estão corretos para o contrato. 
  //       Se estiverem corretos, ele deve responder "Sim".`;
  //     }
  //     else {
  //       // Cenário C: Fallback (Erro na API da IA ou retorno null)
  //       promptDoBot = `[SISTEMA]: O usuário enviou o ${docTypeContext}, mas não consegui ler os dados automaticamente. 
  //       Agradeça o envio e pergunte se a foto está legível para ele.`;
  //     }
  //     // 11. Aciona o Bot
  //     const aiResponse: any = await this.chatbotService.chat(promptDoBot, conversation.customerPhone);
  //     if (aiResponse) {
  //       await this.sendText(conversation.customerPhone, aiResponse, conversation.id);
  //     }
  //   } catch (error) {
  //     console.error('❌ Erro processamento mídia:', error);
  //     // Mensagem amigável de erro
  //     await this.sendText(conversation.customerPhone, 'Tive uma pequena instabilidade ao processar seu arquivo. Por favor, tente reenviar a foto.', conversation.id);
  //   }
  // }
  async handleIncomingMedia(message, conversation) {
    try {
      const workflowStep = conversation.workflowStep?.trim();
      const fasesDocs = ["COLETA_DOCS", "COLETA_DOCS_EXTRA"];
      const estaEmFaseDeDocs = fasesDocs.includes(workflowStep);
      if (workflowStep === "COLETA_DOCS") {
        await this.sendText(
          conversation.customerPhone,
          "Recebi seu arquivo! \u{1F4CE}\nEstou analisando e validando, aguarde um instante...",
          conversation.id
        );
      }
      let mediaId = "";
      let mimeType = "";
      let mediaType = "document";
      let fileName = "";
      switch (message.type) {
        case "image":
          mediaId = message.image?.id || "";
          mimeType = message.image?.mime_type || "image/jpeg";
          mediaType = "image";
          fileName = `imagem_${Date.now()}.jpg`;
          break;
        case "document":
          mediaId = message.document?.id || "";
          mimeType = message.document?.mime_type || "application/pdf";
          mediaType = "document";
          fileName = message.document?.filename || `documento_${Date.now()}.pdf`;
          break;
        case "audio":
        case "voice":
        case "ptt":
          mediaId = message.audio?.id || "";
          mimeType = message.audio?.mime_type || "audio/ogg";
          mediaType = "audio";
          fileName = `audio_${Date.now()}.ogg`;
          break;
      }
      if (!mediaId) return;
      const fileBuffer = await this.downloadMediaFromMeta(mediaId);
      const extension = fileName.split(".").pop() || "bin";
      const folder = `clientes/${conversation.customerPhone}`;
      const uploadResult = await this.storageService.uploadFile(
        fileBuffer,
        extension,
        folder
      );
      let tipoDocumento = "COMPLEMENTAR";
      let etapaDocumento = "COMPLEMENTAR";
      let analiseIA = null;
      if (workflowStep === "COLETA_DOCS") {
        const pendentes = await this.getDocumentosPendentes(conversation.id);
        if (pendentes.length > 0) {
          tipoDocumento = pendentes[0];
          etapaDocumento = "ESSENCIAL";
          analiseIA = await this.docAnalysisService.analyzeDocument(
            fileBuffer,
            tipoDocumento
          );
          if (analiseIA?.legivel) {
            if (analiseIA.tipo_identificado === "CNH") tipoDocumento = "CNH";
            if (analiseIA.tipo_identificado === "RG") tipoDocumento = "RG";
            if (analiseIA.tipo_identificado === "COMPROVANTE_RESIDENCIA")
              tipoDocumento = "COMP_RES";
          }
        }
      }
      tipoDocumento = normalizarTipoDocumento(tipoDocumento);
      await prisma.conversationDocument.create({
        data: {
          conversationId: conversation.id,
          tipo: tipoDocumento,
          etapa: etapaDocumento,
          mediaUrl: uploadResult.url,
          fileName: `${tipoDocumento}.${extension}`,
          mimeType,
          validado: etapaDocumento === "COMPLEMENTAR" ? true : analiseIA?.legivel ?? false,
          extractedData: etapaDocumento === "ESSENCIAL" ? analiseIA ?? {} : {}
        }
      });
      if (etapaDocumento === "ESSENCIAL" && analiseIA && analiseIA.legivel) {
        const patch = {};
        if (analiseIA.lado === "FRENTE_E_VERSO") {
          patch.extracted_RG_FRENTE_legivel = true;
          patch.extracted_RG_VERSO_legivel = true;
        }
        if (analiseIA.lado === "FRENTE") {
          patch.extracted_RG_FRENTE_legivel = true;
        }
        if (analiseIA.lado === "VERSO") {
          patch.extracted_RG_VERSO_legivel = true;
        }
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            tempData: {
              ...conversation.tempData ?? {},
              [`extracted_${tipoDocumento}_nome`]: analiseIA.nome_completo,
              [`extracted_${tipoDocumento}_rg`]: analiseIA.rg_numero,
              [`extracted_${tipoDocumento}_cpf`]: analiseIA.cpf_numero,
              [`extracted_${tipoDocumento}_endereco`]: analiseIA.endereco_completo,
              [`extracted_${tipoDocumento}_legivel`]: true
            }
          }
        });
        console.log(`\u2705 Dados extra\xEDdos do ${tipoDocumento}:`, analiseIA);
      }
      const savedMessage = await prisma.message.create({
        data: {
          wa_id: message.id,
          content: uploadResult.url,
          role: "USER",
          type: mediaType,
          status: "read",
          conversationId: conversation.id,
          fileName: `${tipoDocumento}.${extension}`
        }
      });
      this.app.io.emit("new_whatsapp_message", {
        ...savedMessage,
        conversationId: conversation.id
      });
      if (!estaEmFaseDeDocs) return;
      let promptDoBot = "";
      const pendentesAgora = await this.getDocumentosPendentes(
        conversation.id
      );
      if (workflowStep === "COLETA_DOCS_EXTRA") {
        await this.sendText(
          conversation.customerPhone,
          "Recebi seu arquivo!",
          conversation.id
        );
        return;
      } else if (pendentesAgora.length === 0) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { workflowStep: "COLETA_DOCS_EXTRA" }
        });
        const tipoCaso = conversation.tipoCaso || "seu caso";
        promptDoBot = `
[SISTEMA]:
Perfeito! Recebemos todas as documenta\xE7\xF5es b\xE1sicas.
Explique que agora ele pode enviar provas adicionais (fotos, v\xEDdeos, \xE1udios, prints) para refor\xE7ar ${tipoCaso}.
Diga que quando terminar, deve digitar FINALIZAR.
`;
      } else {
        const proximo = pendentesAgora[0];
        let nomeProximo = proximo;
        if (proximo === "RG") nomeProximo = "RG ou CNH (foto leg\xEDvel)";
        if (proximo === "COMP_RES")
          nomeProximo = "Comprovante de Resid\xEAncia";
        const feedback = analiseIA && !analiseIA.legivel ? `A imagem enviada ficou um pouco ileg\xEDvel, mas seguimos com o processo.` : `Documento recebido com sucesso.`;
        promptDoBot = `
[SISTEMA]:
${feedback}
Pe\xE7a imediatamente o pr\xF3ximo documento: ${nomeProximo}.
Seja claro e direto.
`;
      }
      const aiResponse = await this.chatbotService.chat(
        promptDoBot,
        conversation.customerPhone
      );
      if (aiResponse) {
        await this.sendText(
          conversation.customerPhone,
          aiResponse,
          conversation.id
        );
      }
    } catch (error) {
      console.error("\u274C Erro processamento m\xEDdia:", error);
      await this.sendText(
        conversation.customerPhone,
        "Tive uma instabilidade ao processar o arquivo. Pode tentar reenviar?",
        conversation.id
      );
    }
  }
  // ===========================================================================
  // CORREÇÃO 2: Adicionando o método que faltava (Erro TypeScript)
  // ===========================================================================
  async sendMediaMessage(conversationId, fileBuffer, mimeType, fileName) {
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new Error("Conversa n\xE3o encontrada");
    const folder = `atendimentos/${conversation.customerPhone}`;
    const uploadResult = await this.storageService.uploadFile(fileBuffer, fileName.split(".").pop() || "bin", folder);
    const mediaId = await this.uploadMediaToMeta(fileBuffer, mimeType, fileName);
    let payload = {
      messaging_product: "whatsapp",
      to: conversation.customerPhone,
      type: "document",
      document: { id: mediaId, filename: fileName }
    };
    if (mimeType.startsWith("image/")) {
      payload.type = "image";
      delete payload.document;
      payload.image = { id: mediaId };
    } else if (mimeType.startsWith("audio/")) {
      payload.type = "audio";
      delete payload.document;
      payload.audio = { id: mediaId };
    }
    const metaResponse = await this.callMetaApi("/messages", "POST", payload);
    if (metaResponse.error) throw new Error(metaResponse.error.message);
    const savedMessage = await prisma.message.create({
      data: {
        wa_id: metaResponse.messages?.[0]?.id,
        content: uploadResult.url,
        // Salva URL do R2
        role: "AGENT",
        type: this.mapMimeTypeToPrismaType(mimeType),
        status: "sent",
        fileName,
        conversationId: conversation.id
      }
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageBody: fileName, lastMessageTime: /* @__PURE__ */ new Date() }
    });
    this.app.io.emit("new_whatsapp_message", { ...savedMessage, conversationId: conversation.id });
    return savedMessage;
  }
  // --- DOWNLOAD DA META (O PASSO QUE FALTAVA) ---
  async downloadMediaFromMeta(mediaId) {
    const urlRes = await (0, import_node_fetch.default)(`https://graph.facebook.com/${this.version}/${mediaId}`, {
      headers: { "Authorization": `Bearer ${this.token}` }
    });
    const urlJson = await urlRes.json();
    if (!urlJson.url) throw new Error("URL de m\xEDdia n\xE3o encontrada na Meta");
    const binaryRes = await (0, import_node_fetch.default)(urlJson.url, {
      headers: { "Authorization": `Bearer ${this.token}` }
    });
    const arrayBuffer = await binaryRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  // --- Auxiliar: Checklist de Pendências ---
  // private async getDocumentosPendentes(conversationId: string) {
  //   const docs = await prisma.conversationDocument.findMany({
  //     where: {
  //       conversationId,
  //       etapa: 'ESSENCIAL',
  //       validado: true,
  //     },
  //     select: { tipo: true },
  //   });
  //   const recebidos = docs.map(d => normalizarTipoDocumento(d.tipo));
  //   const checklistBase = ['RG', 'COMP_RES'];
  //   return checklistBase.filter(d => !recebidos.includes(d));
  // }
  async getDocumentosPendentes(conversationId) {
    const docs = await prisma.conversationDocument.findMany({
      where: {
        conversationId,
        etapa: "ESSENCIAL",
        validado: true
      },
      select: {
        tipo: true,
        extractedData: true
      }
    });
    const pendentes = [];
    const docsIdentidade = docs.filter(
      (d) => d.tipo === "RG" || d.tipo === "CNH"
    );
    const temDocumentoUnico = docsIdentidade.some(
      (d) => d.extractedData?.lado === "FRENTE_E_VERSO"
    );
    const temFrente = docsIdentidade.some(
      (d) => d.extractedData?.lado === "FRENTE"
    );
    const temVerso = docsIdentidade.some(
      (d) => d.extractedData?.lado === "VERSO"
    );
    const identidadeCompleta = temDocumentoUnico || temFrente && temVerso;
    if (!identidadeCompleta) {
      pendentes.push("RG");
    }
    const temCompRes = docs.some((d) => d.tipo === "COMP_RES");
    if (!temCompRes) {
      pendentes.push("COMP_RES");
    }
    return pendentes;
  }
  // --- Auxiliar: Atualiza Stats da Conversa ---
  async updateConversationStats(id, lastBody) {
    await prisma.conversation.update({
      where: { id },
      data: {
        unreadCount: { increment: 1 },
        lastMessageBody: lastBody,
        lastMessageTime: /* @__PURE__ */ new Date()
      }
    });
  }
  // ===========================================================================
  // 3. MÉTODOS DE LEITURA E AÇÃO (Mantidos iguais ao seu código original)
  // ===========================================================================
  async listarConversas() {
    const conversas = await prisma.conversation.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        messages: { take: 1, orderBy: { createdAt: "desc" } },
        attendant: { select: { id: true, nome: true } }
      }
    });
    return conversas.map((c) => {
      const lastMsg = c.messages?.[0];
      return {
        id: c.id,
        status: c.status,
        channel: c.channel,
        unreadCount: c.unreadCount,
        tags: c.tags,
        updatedAt: c.updatedAt,
        // 👤 CLIENTE NORMALIZADO
        cliente: {
          nome: c.customerName || c.customerPhone || "Cliente sem nome",
          telefone: c.customerPhone,
          avatar: c.customerAvatar || null
        },
        // 💬 ÚLTIMA MENSAGEM
        ultimaMensagem: lastMsg?.content || c.lastMessageBody || "",
        ultimaMensagemEm: lastMsg?.createdAt || c.lastMessageTime,
        attendantId: c.attendantId,
        attendant: c.attendant
      };
    });
  }
  async getConversationById(id) {
    return prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        attendant: { select: { id: true, nome: true } }
      }
    });
  }
  async updateConversation(id, data) {
    return prisma.conversation.update({ where: { id }, data });
  }
  async updateCustomerData(id, data) {
    return prisma.conversation.update({
      where: { id },
      data: { customerName: data.nome }
    });
  }
  async markConversationAsRead(id) {
    await prisma.conversation.update({
      where: { id },
      data: { unreadCount: 0 }
    });
  }
  async sendTextByConversationId(conversationId, text) {
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new Error("Conversa n\xE3o encontrada");
    return this.sendText(conversation.customerPhone, text, conversationId);
  }
  async sendFileByConversationId(conversationId, filePath, mimeType, fileName) {
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new Error("Conversa n\xE3o encontrada");
    return this.sendFile(conversation.customerPhone, filePath, mimeType, fileName, conversationId);
  }
  // ===========================================================================
  // 4. MÉTODOS CORE DE ENVIO (Mantidos)
  // ===========================================================================
  async sendText(to, text, conversationId) {
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text, preview_url: true }
    };
    const metaResponse = await this.callMetaApi("/messages", "POST", payload);
    if (metaResponse.error) throw new Error(metaResponse.error.message);
    if (!metaResponse.messages?.[0]?.id) throw new Error("Mensagem n\xE3o aceita pela Meta");
    if (!conversationId) {
      const conv = await this.findOrCreateConversation(to);
      conversationId = conv.id;
    }
    const savedMessage = await prisma.message.create({
      data: {
        wa_id: metaResponse.messages?.[0]?.id,
        content: text,
        role: "AGENT",
        type: "text",
        status: "sent",
        conversationId
      }
    });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageBody: text, lastMessageTime: /* @__PURE__ */ new Date() }
    });
    return savedMessage;
  }
  // private async sendFile(to: string, filePath: string, mimeType: string, fileName: string, conversationId?: string) {
  //   const mediaId = await this.uploadMediaToMeta(filePath, mimeType);
  //   const payload: MetaMessagePayload = {
  //     messaging_product: 'whatsapp',
  //     to,
  //     type: 'document',
  //     document: { id: mediaId, filename: fileName }
  //   };
  //   if (mimeType.includes('image')) {
  //     payload.type = 'image';
  //     delete payload.document;
  //     payload.image = { id: mediaId };
  //   }
  //   const metaResponse: any = await this.callMetaApi('/messages', 'POST', payload);
  //   if (!conversationId) {
  //     const conv = await this.findOrCreateConversation(to);
  //     conversationId = conv.id;
  //   }
  //   return prisma.message.create({
  //     data: {
  //       wa_id: metaResponse.messages?.[0]?.id,
  //       content: fileName,
  //       role: 'AGENT',
  //       type: mimeType.includes('image') ? 'image' : 'document',
  //       status: 'sent',
  //       fileName: fileName,
  //       conversationId: conversationId!
  //     }
  //   });
  // }
  // ===========================================================================
  // 5. HELPERS GERAIS
  // ===========================================================================
  // ===========================================================================
  // CORREÇÃO: Método legado 'sendFile' adaptado para a nova assinatura
  // ===========================================================================
  async sendFile(to, filePath, mimeType, fileName, conversationId) {
    const fs = require("fs");
    const fileBuffer = fs.readFileSync(filePath);
    const mediaId = await this.uploadMediaToMeta(fileBuffer, mimeType, fileName);
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "document",
      document: { id: mediaId, filename: fileName }
    };
    if (mimeType.includes("image")) {
      payload.type = "image";
      delete payload.document;
      payload.image = { id: mediaId };
    } else if (mimeType.includes("audio") || mimeType.includes("ogg")) {
      payload.type = "audio";
      delete payload.document;
      payload.audio = { id: mediaId };
    }
    const metaResponse = await this.callMetaApi("/messages", "POST", payload);
    if (!conversationId) {
      const conv = await this.findOrCreateConversation(to);
      conversationId = conv.id;
    }
    return prisma.message.create({
      data: {
        wa_id: metaResponse.messages?.[0]?.id,
        content: fileName,
        role: "AGENT",
        type: this.mapMimeTypeToPrismaType(mimeType),
        // Usa o helper novo
        status: "sent",
        fileName,
        conversationId
      }
    });
  }
  async findOrCreateConversation(phone, name) {
    let conversation = await prisma.conversation.findUnique({ where: { customerPhone: phone } });
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          customerPhone: phone,
          customerName: name || phone,
          status: "OPEN",
          channel: "whatsapp",
          unreadCount: 0
        }
      });
    }
    return conversation;
  }
  // private async uploadMediaToMeta(filePath: string, mimeType: string): Promise<string> {
  //   const form = new FormData();
  //   const fileBuffer = fs.readFileSync(filePath);
  //   const fileBlob = new Blob([fileBuffer], { type: mimeType });
  //   form.append('file', fileBlob, 'upload.file');
  //   form.append('type', mimeType);
  //   form.append('messaging_product', 'whatsapp');
  //   const response = await fetch(`https://graph.facebook.com/${this.version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/media`, {
  //     method: 'POST',
  //     headers: { 'Authorization': `Bearer ${this.token}` },
  //     body: form
  //   });
  //   if (!response.ok) throw new Error('Falha no upload para Meta');
  //   const data: any = await response.json();
  //   return data.id;
  // }
  // --- Auxiliar: Upload para Meta (Versão Buffer) ---
  async uploadMediaToMeta(fileBuffer, mimeType, fileName) {
    const form = new import_form_data.default();
    form.append("file", fileBuffer, { filename: fileName, contentType: mimeType });
    form.append("type", mimeType);
    form.append("messaging_product", "whatsapp");
    const response = await (0, import_node_fetch.default)(`https://graph.facebook.com/${this.version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/media`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.token}`,
        ...form.getHeaders()
        // Importante para o multipart/form-data funcionar com Buffer
      },
      body: form
    });
    if (!response.ok) {
      const errorData = await response.text();
      console.error("Erro Upload Meta:", errorData);
      throw new Error("Falha no upload para Meta");
    }
    const data = await response.json();
    return data.id;
  }
  async callMetaApi(endpoint, method, body) {
    const res = await (0, import_node_fetch.default)(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        "Authorization": `Bearer ${this.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    return res.json();
  }
  async markAsRead(messageId) {
    await this.callMetaApi("/messages", "POST", {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId
    });
  }
  // --- Helper para mapear tipos MIME para o Enum do Prisma ---
  mapMimeTypeToPrismaType(mime) {
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("audio/") || mime.includes("ogg") || mime.includes("opus")) return "audio";
    return "document";
  }
};

// src/modules/whatsapp/whatsapp.controller.ts
var WhatsappController = class {
  constructor(service) {
    this.service = service;
  }
  // --- WEBHOOKS (Meta) ---
  async verifyWebhook(req, rep) {
    const query = req.query;
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    if (query["hub.mode"] === "subscribe" && query["hub.verify_token"] === verifyToken) {
      return rep.status(200).send(query["hub.challenge"]);
    }
    return rep.status(403).send("Falha na verifica\xE7\xE3o");
  }
  async handleWebhook(req, rep) {
    const body = req.body;
    this.service.processWebhook(body).catch(console.error);
    return rep.status(200).send("EVENT_RECEIVED");
  }
  // --- API INTERNA (Para o Angular) ---
  // 1. GET /chat/conversations
  async listConversations(req, rep) {
    try {
      const conversations = await this.service.listarConversas();
      return rep.status(200).send(conversations);
    } catch (error) {
      console.error(error);
      return rep.status(500).send({ error: "Erro ao listar conversas" });
    }
  }
  // 2. GET /chat/conversations/:id
  async getConversation(req, rep) {
    const { id } = req.params;
    try {
      const conversation = await this.service.getConversationById(id);
      if (!conversation) return rep.status(404).send({ error: "Conversa n\xE3o encontrada" });
      return rep.status(200).send(conversation);
    } catch (error) {
      return rep.status(500).send({ error: "Erro ao buscar detalhes" });
    }
  }
  // 3. POST /chat/conversations/:id/messages
  async sendMessage(req, rep) {
    const { id } = req.params;
    const { text } = req.body;
    const response = await this.service.sendTextByConversationId(id, text.body);
    return rep.status(200).send(response);
  }
  // 4. POST /chat/conversations/:id/media
  // async sendMedia(req: FastifyRequest, rep: FastifyReply) {
  //   const { id } = req.params as { id: string };
  //   const data = await req.file();
  //   if (!data) return rep.status(400).send('Arquivo não enviado');
  //   const fs = require('fs');
  //   const util = require('util');
  //   const pipeline = util.promisify(require('stream').pipeline);
  //   const tempPath = `./uploads/${data.filename}`;
  //   await pipeline(data.file, fs.createWriteStream(tempPath));
  //   const response = await this.service.sendFileByConversationId(
  //     id,
  //     tempPath,
  //     data.mimetype,
  //     data.filename
  //   );
  //   fs.unlinkSync(tempPath);
  //   return rep.status(200).send(response);
  // }
  // 4. POST /chat/conversations/:id/media
  async sendMedia(req, rep) {
    const { id } = req.params;
    const data = await req.file();
    if (!data) {
      return rep.status(400).send({ error: "Arquivo n\xE3o enviado" });
    }
    try {
      const buffer = await data.toBuffer();
      const response = await this.service.sendMediaMessage(
        id,
        buffer,
        data.mimetype,
        data.filename
      );
      return rep.status(200).send(response);
    } catch (error) {
      console.error("Erro ao enviar m\xEDdia:", error);
      return rep.status(500).send({ error: "Falha ao processar arquivo" });
    }
  }
  // 5. POST /chat/conversations/:id/read
  async markAsRead(req, rep) {
    const { id } = req.params;
    await this.service.markConversationAsRead(id);
    return rep.status(200).send();
  }
  // 6. PATCH /chat/conversations/:id (Atualizar status/atendente)
  async updateConversation(req, rep) {
    const { id } = req.params;
    const data = req.body;
    const updated = await this.service.updateConversation(id, data);
    return rep.status(200).send(updated);
  }
  // 7. PUT /chat/conversations/:id/customer (Atualizar dados do cliente)
  async updateCustomer(req, rep) {
    const { id } = req.params;
    const data = req.body;
    const updated = await this.service.updateCustomerData(id, data);
    return rep.status(200).send(updated);
  }
  async aprovarContrato(req, rep) {
    const { id } = req.params;
    const conversa = await this.service.getConversationById(id);
    if (!conversa) return rep.status(404).send({ error: "Cliente n\xE3o encontrado" });
    const zapsign = new ZapSignService();
    const TEMPLATE_ID_PROCURACAO = "seu-id-de-template-aqui";
    try {
      const { linkAssinatura } = await zapsign.criarContrato(
        conversa.customerName || "Cliente",
        TEMPLATE_ID_PROCURACAO
      );
      const mensagem = `Ol\xE1, ${conversa.customerName}! \u{1F44B}

O Dr. Leonardo analisou seu caso e *aprovou* o seguimento.

Para iniciarmos a a\xE7\xE3o, preciso que assine a procura\xE7\xE3o digitalmente. \xC9 r\xE1pido e pode ser feito na tela do celular:

\u{1F58B}\uFE0F *CLIQUE PARA ASSINAR:* ${linkAssinatura}

Assim que assinar, eu recebo o aviso aqui e come\xE7o a redigir a peti\xE7\xE3o.`;
      await this.service.sendTextByConversationId(id, mensagem);
      await this.service.updateConversation(id, {
        workflowStep: "AGUARDANDO_ASSINATURA"
      });
      return rep.status(200).send({ success: true, link: linkAssinatura });
    } catch (error) {
      console.error(error);
      return rep.status(500).send({ error: "Erro ao gerar contrato" });
    }
  }
  async transformarEmProcesso(req, rep) {
    const { id } = req.params;
    const userId = req.user?.sub || "ID_DO_ADVOGADO_PADRAO";
    const service = new CreateProcessoFromConversationService();
    try {
      const processo = await service.execute(id, userId);
      return rep.status(201).send(processo);
    } catch (err) {
      return rep.status(500).send({ error: err.message });
    }
  }
};

// src/modules/whatsapp/whatsapp.module.ts
async function whatsappModule(app2) {
  const chatbotService = new ChatbotService();
  const whatsappService = new WhatsappService(app2, chatbotService);
  const whatsappController = new WhatsappController(whatsappService);
  app2.get("/whatsapp/webhook", (req, rep) => whatsappController.verifyWebhook(req, rep));
  app2.post("/whatsapp/webhook", (req, rep) => whatsappController.handleWebhook(req, rep));
  app2.get("/chat/conversations", (req, rep) => whatsappController.listConversations(req, rep));
  app2.get("/chat/conversations/:id", (req, rep) => whatsappController.getConversation(req, rep));
  app2.post("/chat/conversations/:id/messages", (req, rep) => whatsappController.sendMessage(req, rep));
  app2.post("/chat/conversations/:id/media", (req, rep) => whatsappController.sendMedia(req, rep));
  app2.post("/chat/conversations/:id/read", (req, rep) => whatsappController.markAsRead(req, rep));
  app2.patch("/chat/conversations/:id", (req, rep) => whatsappController.updateConversation(req, rep));
  app2.put("/chat/conversations/:id/customer", (req, rep) => whatsappController.updateCustomer(req, rep));
  app2.post("/chat/conversations/:id/approve", (req, rep) => whatsappController.aprovarContrato(req, rep));
  app2.post("/chat/atendimentos/:id/mensagens/upload", (req, rep) => whatsappController.sendMedia(req, rep));
}

// src/infra/controllers/webhook.controller.ts
var WebhookController = class {
  storage;
  chatbot;
  constructor() {
    this.storage = new StorageService();
    this.chatbot = new ChatbotService();
  }
  /**
   * Processa mídia recebida (Imagem/PDF)
   * Nota: Este método espera receber o buffer direto. 
   * Se você usa fastify-multipart, chame este método de dentro da sua rota principal.
   */
  async handleIncomingMedia(customerPhone, fileBuffer, mimeType) {
    console.log(`[Webhook] Recebendo m\xEDdia de ${customerPhone} (${mimeType})`);
    const conversation = await prisma.conversation.findUnique({
      where: { customerPhone }
    });
    if (!conversation) {
      console.log("[Webhook] Conversa n\xE3o encontrada para upload.");
      return;
    }
    let docTypeTag = "OUTROS";
    const pendentes = await this.getDocumentosPendentes(conversation);
    if (conversation.workflowStep === "COLETA_DOCS" && pendentes.length > 0) {
      docTypeTag = pendentes[0] ?? "OUTROS";
      console.log(`[Webhook] Inferindo tipo de documento: ${docTypeTag}`);
    }
    const extension = mimeType.split("/")[1] || "jpg";
    const folder = `clientes/${customerPhone}`;
    const uploadResult = await this.storage.uploadFile(fileBuffer, extension, folder);
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        type: "document",
        content: uploadResult.url,
        // URL pública da imagem
        fileName: `${docTypeTag}.${extension}`
      }
    });
    console.log(`[Webhook] Documento salvo no banco: ${docTypeTag}.${extension}`);
    const response = await this.chatbot.chat("", customerPhone);
    return response;
  }
  /**
   * Webhook do ZapSign (Documentos Assinados)
   */
  async handleZapSign(req, reply) {
    const data = req.body;
    console.log("\u{1F514} Webhook ZapSign Recebido:", data.event_type);
    if (data.event_type === "doc_signed") {
      const signers = data.payload.signers;
      for (const signer of signers) {
        if (signer.status === "signed") {
          console.log(`\u2705 Assinado por: ${signer.email}`);
          const conversa = await prisma.conversation.findFirst({
            where: {
              OR: [
                { customerName: signer.name }
                // Busca por nome
                // { customerEmail: signer.email } // Se tiver email no banco, descomente
              ]
            }
          });
          if (conversa) {
            await prisma.conversation.update({
              where: { id: conversa.id },
              data: { workflowStep: "FINALIZADO" }
            });
            console.log(`\u{1F680} Workflow do cliente ${conversa.customerName} movido para FINALIZADO.`);
          } else {
            console.log(`\u26A0\uFE0F Cliente n\xE3o encontrado para assinatura de: ${signer.name}`);
          }
        }
      }
    }
    return reply.status(200).send({ received: true });
  }
  /**
   * Helper Privado: Verifica quais documentos faltam
   */
  async getDocumentosPendentes(conversation) {
    const msgs = await prisma.message.findMany({
      where: { conversationId: conversation.id, type: "document" },
      select: { fileName: true }
    });
    const recebidos = msgs.map((m) => m.fileName?.split(".")[0]?.toUpperCase()).filter((doc) => !!doc);
    const checklistBase = ["RG", "COMP_RES"];
    return checklistBase.filter((d) => !recebidos.includes(d));
  }
};

// src/infra/controllers/webhook.module.ts
async function webhookModule(app2) {
  const webhookController = new WebhookController();
  app2.post("/webhooks/zapsign", async (req, reply) => {
    return webhookController.handleZapSign(req, reply);
  });
  app2.post("/webhooks/whatsapp/media", async (req, reply) => {
    const data = await req.file();
    if (!data) {
      return reply.status(400).send({ error: "Nenhum arquivo enviado." });
    }
    const phone = "5511999999999";
    const buffer = await data.toBuffer();
    const mimetype = data.mimetype;
    await webhookController.handleIncomingMedia(
      phone,
      await data?.toBuffer() ?? Buffer.alloc(0),
      // Se não tiver buffer, manda vazio
      data?.mimetype ?? "application/octet-stream"
      // Se não tiver mime, manda genérico
    );
    return reply.send({ ok: true });
  });
}

// src/modules/leads/leads.service.ts
var LeadsService = class {
  // Não precisa de construtor vazio se não for injetar nada
  async findAll() {
    const conversations = await prisma.conversation.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        documents: true
      }
    });
    return conversations.map((conv) => {
      const tempData = conv.tempData || {};
      const docs = conv.documents.map((doc) => ({
        id: doc.id,
        tipo: doc.tipo,
        fileName: doc.fileName || "",
        mediaUrl: doc.mediaUrl || "",
        validado: doc.validado,
        etapa: doc.etapa
      }));
      return {
        id: conv.id,
        nome: conv.customerName || "Sem Nome",
        telefone: conv.customerPhone,
        canal: conv.channel,
        dataEntrada: conv.createdAt,
        ultimaMensagem: conv.lastMessageBody || "",
        tipoCaso: conv.tipoCaso || tempData.tipoCaso || "GERAL",
        empresa: tempData.empresa || "",
        dataOcorrido: tempData.data_do_ocorrido || tempData.dataOcorrido || "",
        dinamicaDoDano: tempData.dinamica_do_dano || tempData.dinamicaDoDano || "",
        prejuizo: tempData.prejuizo || "",
        workflowStep: conv.workflowStep,
        aguardandoDocumentos: !!tempData.aguardandoDocumentos,
        documentosEssenciais: docs.filter((d) => d.etapa === "ESSENCIAL"),
        documentosComplementares: docs.filter((d) => d.etapa === "COMPLEMENTAR")
      };
    });
  }
};

// src/modules/leads/leads.controller.ts
var LeadsController = class {
  leadsService;
  constructor() {
    this.leadsService = new LeadsService();
  }
  // Usamos arrow function aqui para não perder o "this" quando chamado pela rota
  getLeads = async (request, reply) => {
    try {
      const leads = await this.leadsService.findAll();
      return reply.send(leads);
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ error: "Erro ao buscar leads" });
    }
  };
};

// src/modules/leads/leads.module.ts
async function leadsModule(app2) {
  const controller = new LeadsController();
  app2.get("/", controller.getLeads);
}

// src/modules/processos/upload.controller.ts
var import_node_path = require("path");
async function uploadRoutes(app2) {
  const storage = new StorageService();
  app2.post("/upload", async (req, rep) => {
    const data = await req.file();
    if (!data) {
      return rep.status(400).send({ error: "Nenhum arquivo enviado." });
    }
    try {
      const buffer = await data.toBuffer();
      const extension = (0, import_node_path.extname)(data.filename).replace(".", "");
      const uploadResult = await storage.uploadFile(buffer, extension, "anexos-processos");
      return rep.send({
        url: uploadResult.url,
        // URL pública do R2
        nomeOriginal: data.filename,
        // Nome original do arquivo (ex: "Contrato.pdf")
        tipo: data.mimetype
        // MimeType (ex: "application/pdf")
      });
    } catch (err) {
      console.error("Erro no upload:", err);
      return rep.status(500).send({ error: "Erro interno ao processar upload." });
    }
  });
}

// src/modules/cliente/clientes.service.ts
var ClientesService = class {
  // Buscar por ID
  async findById(id) {
    return await prisma.cliente.findUnique({
      where: { id },
      include: {
        processos: {
          select: {
            id: true,
            numeroProcesso: true,
            statusGeral: true,
            descricaoObjeto: true
          }
        }
      }
    });
  }
  // Buscar por Telefone (útil para busca rápida)
  async findByTelefone(telefone) {
    return await prisma.cliente.findUnique({
      where: { telefone },
      include: { processos: true }
    });
  }
  // Atualizar dados do cliente (ex: corrigir email)
  async update(id, data) {
    return await prisma.cliente.update({
      where: { id },
      data: {
        nome: data.nome,
        email: data.email,
        cpf: data.cpf,
        endereco: data.endereco,
        telefone: data.telefone
      }
    });
  }
  // Listar todos (com paginação simples ou filtro)
  async list(search) {
    return await prisma.cliente.findMany({
      where: search ? {
        OR: [
          { nome: { contains: search, mode: "insensitive" } },
          { cpf: { contains: search } },
          { telefone: { contains: search } }
        ]
      } : {},
      // ADICIONE ESTE BLOCO INCLUDE
      include: {
        processos: {
          select: {
            id: true,
            numeroProcesso: true,
            statusGeral: true,
            descricaoObjeto: true
          }
        }
      },
      orderBy: { nome: "asc" },
      take: 50
    });
  }
};

// src/modules/cliente/clientes.controller.ts
var import_zod7 = require("zod");
var ClientesController = class {
  service = new ClientesService();
  // GET /clientes/:id
  async getById(req, rep) {
    const paramsSchema = import_zod7.z.object({
      id: import_zod7.z.string()
    });
    const { id } = paramsSchema.parse(req.params);
    const cliente = await this.service.findById(id);
    if (!cliente) {
      return rep.status(404).send({ message: "Cliente n\xE3o encontrado" });
    }
    return rep.send(cliente);
  }
  // PUT /clientes/:id
  async update(req, rep) {
    const paramsSchema = import_zod7.z.object({
      id: import_zod7.z.string()
    });
    const bodySchema = import_zod7.z.object({
      nome: import_zod7.z.string().optional(),
      email: import_zod7.z.string().email().optional().nullable(),
      cpf: import_zod7.z.string().optional().nullable(),
      telefone: import_zod7.z.string().optional(),
      endereco: import_zod7.z.string().optional().nullable()
    });
    const { id } = paramsSchema.parse(req.params);
    const data = bodySchema.parse(req.body);
    try {
      const atualizado = await this.service.update(id, data);
      return rep.send(atualizado);
    } catch (error) {
      return rep.status(400).send({ error: "Erro ao atualizar cliente" });
    }
  }
  // GET /clientes (Busca)
  async list(req, rep) {
    const querySchema = import_zod7.z.object({
      q: import_zod7.z.string().optional()
      // ?q=Diego
    });
    const { q } = querySchema.parse(req.query);
    const clientes = await this.service.list(q);
    return rep.send(clientes);
  }
};

// src/modules/cliente/clientes.module.ts
async function clientesRoutes(app2) {
  const controller = new ClientesController();
  app2.get("/:id", async (req, rep) => controller.getById(req, rep));
  app2.put("/:id", async (req, rep) => controller.update(req, rep));
  app2.get("/", async (req, rep) => controller.list(req, rep));
}

// src/modules/financeiro/financeiro.service.ts
var FinanceiroService = class {
  async create(data, userId) {
    return await prisma.$transaction(async (tx) => {
      let safeProcessoId = null;
      if (data.processoId) {
        const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(data.processoId);
        if (isValidObjectId) {
          safeProcessoId = data.processoId;
        } else {
          if (data.processoId.trim() !== "") {
            console.warn(`\u26A0\uFE0F [Financeiro] ID inv\xE1lido ignorado: "${data.processoId}"`);
          }
          safeProcessoId = null;
        }
      }
      const transacao = await tx.transacao.create({
        data: {
          tipo: data.tipo,
          categoria: data.categoria,
          valor: data.valor,
          data: new Date(data.data).toISOString(),
          // Garante string ISO para o Mongo
          descricao: data.descricao,
          recorrente: data.recorrente,
          processoId: safeProcessoId,
          createdBy: userId
        }
      });
      if (safeProcessoId) {
        let field = null;
        const catLower = data.categoria.toLowerCase();
        if (data.tipo === "entrada") {
          if (catLower.includes("iniciais")) field = "valorHonorariosIniciaisPago";
          else if (catLower.includes("\xEAxito") || catLower.includes("exito")) field = "valorHonorariosExitoPago";
        } else {
          field = "custosProcessuais";
        }
        if (field) {
          try {
            await tx.processo.update({
              where: { id: safeProcessoId },
              data: { [field]: { increment: data.valor } }
            });
          } catch (error) {
            console.error(`Erro ao atualizar totais do processo`, error);
          }
        }
      }
      return transacao;
    });
  }
  async list(userId) {
    return await prisma.transacao.findMany({
      where: {
        createdBy: userId,
        arquivado: false
      },
      orderBy: {
        createdAt: "desc"
      },
      // ADICIONE ISSO:
      include: {
        user: {
          select: {
            nome: true
            // Busca apenas o campo 'nome' do modelo User
          }
        }
      }
    });
  }
  async setArquivado(id, userId, status) {
    return await prisma.transacao.updateMany({
      where: { id, createdBy: userId },
      data: { arquivado: status }
    });
  }
  async delete(id, userId) {
    return await prisma.transacao.deleteMany({
      where: {
        id,
        createdBy: userId
      }
    });
  }
};

// src/modules/financeiro/dto/create-financeiro.dto.ts
var import_zod8 = require("zod");
var createFinanceiroSchema = import_zod8.z.object({
  // MUDANÇA AQUI: Padronizado para minúsculo
  tipo: import_zod8.z.enum(["entrada", "saida"]),
  categoria: import_zod8.z.string(),
  valor: import_zod8.z.number().positive(),
  data: import_zod8.z.coerce.date(),
  descricao: import_zod8.z.string().min(3),
  // Aceita string (ID do Mongo), null ou undefined
  processoId: import_zod8.z.string().optional().nullable(),
  // Garante que o campo exista no objeto final 'data'
  recorrente: import_zod8.z.boolean().default(false)
});

// src/modules/financeiro/financeiro.controller.ts
var FinanceiroController = class {
  service = new FinanceiroService();
  async create(req, rep) {
    const data = createFinanceiroSchema.parse(req.body);
    const userId = req.user.sub;
    const res = await this.service.create(data, userId);
    return rep.status(201).send(res);
  }
  async list(req, rep) {
    const userId = req.user.sub;
    const items = await this.service.list(userId);
    return rep.send(items);
  }
  async resumo(req, rep) {
    const stats = await this.service.getResumo(req.user.sub);
    return rep.send(stats);
  }
  async delete(req, rep) {
    const { id } = req.params;
    await this.service.delete(id, req.user.sub);
    return rep.status(204).send();
  }
};

// src/modules/financeiro/financeiro.module.ts
async function financeiroModule(app2) {
  const controller = new FinanceiroController();
  app2.register(async (group) => {
    group.addHook("preHandler", app2.authenticate);
    group.get("/", (req, res) => controller.list(req, res));
    group.get("/resumo", (req, res) => controller.resumo(req, res));
    group.post("/", (req, res) => controller.create(req, res));
    group.delete("/:id", (req, res) => controller.delete(req, res));
  }, { prefix: "/financeiro" });
}

// src/main.ts
var app = (0, import_fastify.default)({ logger: true });
app.register(import_jwt.default, {
  secret: process.env.JWT_SECRET || "secret-2026"
});
app.register(import_cors.default, {
  // Se for produção (Vercel), use a URL do seu Angular. Se for local, permite tudo.
  origin: process.env.NODE_ENV === "production" ? ["https://seu-front-nobre.vercel.app"] : true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
});
app.register(import_multipart.default, {
  limits: {
    fileSize: 10 * 1024 * 1024
    // Limite de 10MB (PDFs jurídicos)
  }
});
app.register(import_fastify_socket.default, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
  }
});
app.decorate("authenticate", async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({ message: "Sess\xE3o expirada ou inv\xE1lida." });
  }
});
app.register(authModule);
app.register(dashboardModule);
app.register(processosModule);
app.register(financeiroModule);
app.register(usersModule);
app.register(whatsappModule);
app.register(webhookModule);
app.register(leadsModule, { prefix: "leads" });
app.register(uploadRoutes);
app.register(clientesRoutes, { prefix: "clientes" });
app.get("/api/cron/notify-agenda", async (req, reply) => {
  const authHeader = req.headers["authorization"];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return reply.status(401).send("N\xE3o autorizado");
  }
  app.log.info("\u{1F4C5} [CRON] Iniciando notifica\xE7\xF5es...");
  const notifyService = new NotifyDailyAgendaService(mailService);
  await notifyService.execute();
  return { success: true };
});
var mailService = new MailService();
import_node_cron.default.schedule("0 18 * * *", async () => {
  app.log.info("\u{1F4C5} [SCHEDULER] Iniciando notifica\xE7\xF5es de agenda...");
  const notifyService = new NotifyDailyAgendaService(mailService);
  try {
    await notifyService.execute();
    app.log.info("\u2705 Notifica\xE7\xF5es enviadas com sucesso.");
  } catch (err) {
    app.log.error("\u274C Falha no scheduler de agenda:", err);
  }
});
if (process.env.NODE_ENV !== "production") {
  const start = async () => {
    try {
      await app.listen({ port: 3333, host: "0.0.0.0" });
      console.log("\u{1F680} RCS Advogados - Backend 2.0 Rodando localmente na porta 3333");
    } catch (err) {
      app.log.error(err);
      process.exit(1);
    }
  };
  start();
}
var main_default = async (req, res) => {
  await app.ready();
  app.server.emit("request", req, res);
};
