// Testes do mapeador puro Vendor (Zoho) -> supplier.
import { test } from "node:test";
import assert from "node:assert/strict";

import { mapVendorToSupplier, extrairEmailVendor, normalizarNome } from "./supplier-sync.ts";

const TENANT = "tenant-1";

test("mapVendorToSupplier mapeia os campos principais", () => {
  const m = mapVendorToSupplier(
    { id: "ZV1", Vendor_Name: "Kaplan International", Website: "https://kaplan.com", Country: "GB", Email: "Adm@Kaplan.com" },
    TENANT
  );
  assert.ok(m);
  assert.equal(m!.supplier.zoho_vendor_id, "ZV1");
  assert.equal(m!.supplier.display_name, "Kaplan International");
  assert.equal(m!.supplier.website, "https://kaplan.com");
  assert.equal(m!.supplier.country_code, "GB");
  assert.equal(m!.supplier.relationship_status, "connected");
  assert.equal(m!.supplier.tenant_id, TENANT);
  assert.equal(m!.email, "adm@kaplan.com");
  assert.equal(m!.contactName, "Kaplan International");
});

test("mapVendorToSupplier ignora Vendor sem id (sem chave de idempotencia)", () => {
  assert.equal(mapVendorToSupplier({ Vendor_Name: "Sem Id" }, TENANT), null);
});

test("mapVendorToSupplier so aceita country_code de 2 letras", () => {
  const m = mapVendorToSupplier({ id: "ZV2", Vendor_Name: "X", Country: "United States" }, TENANT);
  assert.equal(m!.supplier.country_code, null);
});

test("mapVendorToSupplier cai para display_name '(sem nome)' quando falta o nome", () => {
  const m = mapVendorToSupplier({ id: "ZV3" }, TENANT);
  assert.equal(m!.supplier.display_name, "(sem nome)");
  assert.equal(m!.email, null);
});

test("extrairEmailVendor valida e normaliza (minusculo)", () => {
  assert.equal(extrairEmailVendor({ Email: "  Contato@Escola.COM " }), "contato@escola.com");
  assert.equal(extrairEmailVendor({ Email: "sem-arroba" }), null);
  assert.equal(extrairEmailVendor({}), null);
});

test("normalizarNome casa nomes com acento/caixa/espacos", () => {
  // escola_nome (viagem_info) x display_name (supplier) devem casar apos normalizar.
  assert.equal(normalizarNome("  Connect   International Schools "), "connect international schools");
  assert.equal(
    normalizarNome("Écòle de Montréal"),
    normalizarNome("ecole de montreal")
  );
  assert.equal(normalizarNome(null), "");
});
