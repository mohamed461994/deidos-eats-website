/**
 * All API shapes come from the contracts package (source of truth, pinned by
 * the platform's contract-first rule). This module is the only place that
 * touches the generated file; feature code imports from here.
 */
import type { components } from '@deidos-eats/contracts/generated/typescript'

type Schemas = components['schemas']

export type Restaurant = Schemas['Restaurant']
export type RestaurantList = Schemas['RestaurantList']
export type BranchSummary = Schemas['BranchSummary']
export type Branch = Schemas['Branch']
export type OpeningHour = Schemas['OpeningHours']
export type Menu = Schemas['Menu']
export type MenuCategory = Schemas['MenuCategory']
export type MenuItem = Schemas['MenuItem']
export type ModifierGroup = Schemas['ModifierGroup']
export type ModifierOption = Schemas['ModifierOption']
export type Allergen = Schemas['Allergen']

export type CartLineInput = Schemas['CartLineInput']
export type CartValidateRequest = Schemas['CartValidateRequest']
export type PricedCart = Schemas['PricedCart']
export type PricedCartLine = Schemas['PricedCartLine']

export type CheckoutRequest = Schemas['CheckoutRequest']
export type CheckoutResponse = Schemas['CheckoutResponse']

export type Order = Schemas['Order']
export type OrderSummary = Schemas['OrderSummary']
export type OrderList = Schemas['OrderList']
export type OrderStatus = Schemas['OrderStatus']
export type PaymentStatus = Schemas['PaymentStatus']
export type FulfillmentType = Schemas['FulfillmentType']

export type User = Schemas['User']
export type UserUpdate = Schemas['UserUpdate']
export type Address = Schemas['Address']
export type AddressCreate = Schemas['AddressCreate']
export type AddressList = Schemas['AddressList']
export type DeviceRegistration = Schemas['DeviceRegistration']
export type Device = Schemas['Device']

export type MarketplaceHome = Schemas['MarketplaceHome']
export type MarketplaceBanner = Schemas['MarketplaceBanner']
export type MarketplaceItem = Schemas['MarketplaceItem']
export type MarketplaceBranch = Schemas['MarketplaceBranch']
export type MarketplaceContent = Schemas['MarketplaceContent']

export type ApiErrorBody = Schemas['Error']
export type OrderChangedMessage = Schemas['OrderChangedMessage']
