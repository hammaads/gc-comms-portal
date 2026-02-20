"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ChevronsUpDown, Check } from "lucide-react";

export const COUNTRY_CODES = [
  { value: "+92", label: "PK", name: "Pakistan" },
  { value: "+93", label: "AF", name: "Afghanistan" },
  { value: "+355", label: "AL", name: "Albania" },
  { value: "+213", label: "DZ", name: "Algeria" },
  { value: "+376", label: "AD", name: "Andorra" },
  { value: "+244", label: "AO", name: "Angola" },
  { value: "+1268", label: "AG", name: "Antigua and Barbuda" },
  { value: "+54", label: "AR", name: "Argentina" },
  { value: "+374", label: "AM", name: "Armenia" },
  { value: "+61", label: "AU", name: "Australia" },
  { value: "+43", label: "AT", name: "Austria" },
  { value: "+994", label: "AZ", name: "Azerbaijan" },
  { value: "+1242", label: "BS", name: "Bahamas" },
  { value: "+973", label: "BH", name: "Bahrain" },
  { value: "+880", label: "BD", name: "Bangladesh" },
  { value: "+1246", label: "BB", name: "Barbados" },
  { value: "+375", label: "BY", name: "Belarus" },
  { value: "+32", label: "BE", name: "Belgium" },
  { value: "+501", label: "BZ", name: "Belize" },
  { value: "+229", label: "BJ", name: "Benin" },
  { value: "+975", label: "BT", name: "Bhutan" },
  { value: "+591", label: "BO", name: "Bolivia" },
  { value: "+387", label: "BA", name: "Bosnia and Herzegovina" },
  { value: "+267", label: "BW", name: "Botswana" },
  { value: "+55", label: "BR", name: "Brazil" },
  { value: "+673", label: "BN", name: "Brunei" },
  { value: "+359", label: "BG", name: "Bulgaria" },
  { value: "+226", label: "BF", name: "Burkina Faso" },
  { value: "+257", label: "BI", name: "Burundi" },
  { value: "+855", label: "KH", name: "Cambodia" },
  { value: "+237", label: "CM", name: "Cameroon" },
  { value: "+1", label: "CA", name: "Canada" },
  { value: "+238", label: "CV", name: "Cape Verde" },
  { value: "+236", label: "CF", name: "Central African Republic" },
  { value: "+235", label: "TD", name: "Chad" },
  { value: "+56", label: "CL", name: "Chile" },
  { value: "+86", label: "CN", name: "China" },
  { value: "+57", label: "CO", name: "Colombia" },
  { value: "+269", label: "KM", name: "Comoros" },
  { value: "+243", label: "CD", name: "Congo (DRC)" },
  { value: "+242", label: "CG", name: "Congo (Republic)" },
  { value: "+506", label: "CR", name: "Costa Rica" },
  { value: "+385", label: "HR", name: "Croatia" },
  { value: "+53", label: "CU", name: "Cuba" },
  { value: "+357", label: "CY", name: "Cyprus" },
  { value: "+420", label: "CZ", name: "Czech Republic" },
  { value: "+45", label: "DK", name: "Denmark" },
  { value: "+253", label: "DJ", name: "Djibouti" },
  { value: "+1767", label: "DM", name: "Dominica" },
  { value: "+1809", label: "DO", name: "Dominican Republic" },
  { value: "+593", label: "EC", name: "Ecuador" },
  { value: "+20", label: "EG", name: "Egypt" },
  { value: "+503", label: "SV", name: "El Salvador" },
  { value: "+240", label: "GQ", name: "Equatorial Guinea" },
  { value: "+291", label: "ER", name: "Eritrea" },
  { value: "+372", label: "EE", name: "Estonia" },
  { value: "+268", label: "SZ", name: "Eswatini" },
  { value: "+251", label: "ET", name: "Ethiopia" },
  { value: "+679", label: "FJ", name: "Fiji" },
  { value: "+358", label: "FI", name: "Finland" },
  { value: "+33", label: "FR", name: "France" },
  { value: "+241", label: "GA", name: "Gabon" },
  { value: "+220", label: "GM", name: "Gambia" },
  { value: "+995", label: "GE", name: "Georgia" },
  { value: "+49", label: "DE", name: "Germany" },
  { value: "+233", label: "GH", name: "Ghana" },
  { value: "+30", label: "GR", name: "Greece" },
  { value: "+1473", label: "GD", name: "Grenada" },
  { value: "+502", label: "GT", name: "Guatemala" },
  { value: "+224", label: "GN", name: "Guinea" },
  { value: "+245", label: "GW", name: "Guinea-Bissau" },
  { value: "+592", label: "GY", name: "Guyana" },
  { value: "+509", label: "HT", name: "Haiti" },
  { value: "+504", label: "HN", name: "Honduras" },
  { value: "+36", label: "HU", name: "Hungary" },
  { value: "+354", label: "IS", name: "Iceland" },
  { value: "+91", label: "IN", name: "India" },
  { value: "+62", label: "ID", name: "Indonesia" },
  { value: "+98", label: "IR", name: "Iran" },
  { value: "+964", label: "IQ", name: "Iraq" },
  { value: "+353", label: "IE", name: "Ireland" },
  { value: "+972", label: "IL", name: "Israel" },
  { value: "+39", label: "IT", name: "Italy" },
  { value: "+225", label: "CI", name: "Ivory Coast" },
  { value: "+1876", label: "JM", name: "Jamaica" },
  { value: "+81", label: "JP", name: "Japan" },
  { value: "+962", label: "JO", name: "Jordan" },
  { value: "+7", label: "KZ", name: "Kazakhstan" },
  { value: "+254", label: "KE", name: "Kenya" },
  { value: "+686", label: "KI", name: "Kiribati" },
  { value: "+383", label: "XK", name: "Kosovo" },
  { value: "+965", label: "KW", name: "Kuwait" },
  { value: "+996", label: "KG", name: "Kyrgyzstan" },
  { value: "+856", label: "LA", name: "Laos" },
  { value: "+371", label: "LV", name: "Latvia" },
  { value: "+961", label: "LB", name: "Lebanon" },
  { value: "+266", label: "LS", name: "Lesotho" },
  { value: "+231", label: "LR", name: "Liberia" },
  { value: "+218", label: "LY", name: "Libya" },
  { value: "+423", label: "LI", name: "Liechtenstein" },
  { value: "+370", label: "LT", name: "Lithuania" },
  { value: "+352", label: "LU", name: "Luxembourg" },
  { value: "+261", label: "MG", name: "Madagascar" },
  { value: "+265", label: "MW", name: "Malawi" },
  { value: "+60", label: "MY", name: "Malaysia" },
  { value: "+960", label: "MV", name: "Maldives" },
  { value: "+223", label: "ML", name: "Mali" },
  { value: "+356", label: "MT", name: "Malta" },
  { value: "+692", label: "MH", name: "Marshall Islands" },
  { value: "+222", label: "MR", name: "Mauritania" },
  { value: "+230", label: "MU", name: "Mauritius" },
  { value: "+52", label: "MX", name: "Mexico" },
  { value: "+691", label: "FM", name: "Micronesia" },
  { value: "+373", label: "MD", name: "Moldova" },
  { value: "+377", label: "MC", name: "Monaco" },
  { value: "+976", label: "MN", name: "Mongolia" },
  { value: "+382", label: "ME", name: "Montenegro" },
  { value: "+212", label: "MA", name: "Morocco" },
  { value: "+258", label: "MZ", name: "Mozambique" },
  { value: "+95", label: "MM", name: "Myanmar" },
  { value: "+264", label: "NA", name: "Namibia" },
  { value: "+674", label: "NR", name: "Nauru" },
  { value: "+977", label: "NP", name: "Nepal" },
  { value: "+31", label: "NL", name: "Netherlands" },
  { value: "+64", label: "NZ", name: "New Zealand" },
  { value: "+505", label: "NI", name: "Nicaragua" },
  { value: "+227", label: "NE", name: "Niger" },
  { value: "+234", label: "NG", name: "Nigeria" },
  { value: "+850", label: "KP", name: "North Korea" },
  { value: "+389", label: "MK", name: "North Macedonia" },
  { value: "+47", label: "NO", name: "Norway" },
  { value: "+968", label: "OM", name: "Oman" },
  { value: "+507", label: "PA", name: "Panama" },
  { value: "+675", label: "PG", name: "Papua New Guinea" },
  { value: "+595", label: "PY", name: "Paraguay" },
  { value: "+51", label: "PE", name: "Peru" },
  { value: "+63", label: "PH", name: "Philippines" },
  { value: "+48", label: "PL", name: "Poland" },
  { value: "+351", label: "PT", name: "Portugal" },
  { value: "+974", label: "QA", name: "Qatar" },
  { value: "+40", label: "RO", name: "Romania" },
  { value: "+7", label: "RU", name: "Russia" },
  { value: "+250", label: "RW", name: "Rwanda" },
  { value: "+1869", label: "KN", name: "Saint Kitts and Nevis" },
  { value: "+1758", label: "LC", name: "Saint Lucia" },
  { value: "+1784", label: "VC", name: "Saint Vincent and the Grenadines" },
  { value: "+685", label: "WS", name: "Samoa" },
  { value: "+378", label: "SM", name: "San Marino" },
  { value: "+239", label: "ST", name: "Sao Tome and Principe" },
  { value: "+966", label: "SA", name: "Saudi Arabia" },
  { value: "+221", label: "SN", name: "Senegal" },
  { value: "+381", label: "RS", name: "Serbia" },
  { value: "+248", label: "SC", name: "Seychelles" },
  { value: "+232", label: "SL", name: "Sierra Leone" },
  { value: "+65", label: "SG", name: "Singapore" },
  { value: "+421", label: "SK", name: "Slovakia" },
  { value: "+386", label: "SI", name: "Slovenia" },
  { value: "+677", label: "SB", name: "Solomon Islands" },
  { value: "+252", label: "SO", name: "Somalia" },
  { value: "+27", label: "ZA", name: "South Africa" },
  { value: "+82", label: "KR", name: "South Korea" },
  { value: "+211", label: "SS", name: "South Sudan" },
  { value: "+34", label: "ES", name: "Spain" },
  { value: "+94", label: "LK", name: "Sri Lanka" },
  { value: "+249", label: "SD", name: "Sudan" },
  { value: "+597", label: "SR", name: "Suriname" },
  { value: "+46", label: "SE", name: "Sweden" },
  { value: "+41", label: "CH", name: "Switzerland" },
  { value: "+963", label: "SY", name: "Syria" },
  { value: "+886", label: "TW", name: "Taiwan" },
  { value: "+992", label: "TJ", name: "Tajikistan" },
  { value: "+255", label: "TZ", name: "Tanzania" },
  { value: "+66", label: "TH", name: "Thailand" },
  { value: "+670", label: "TL", name: "Timor-Leste" },
  { value: "+228", label: "TG", name: "Togo" },
  { value: "+676", label: "TO", name: "Tonga" },
  { value: "+1868", label: "TT", name: "Trinidad and Tobago" },
  { value: "+216", label: "TN", name: "Tunisia" },
  { value: "+90", label: "TR", name: "Turkey" },
  { value: "+993", label: "TM", name: "Turkmenistan" },
  { value: "+688", label: "TV", name: "Tuvalu" },
  { value: "+256", label: "UG", name: "Uganda" },
  { value: "+380", label: "UA", name: "Ukraine" },
  { value: "+971", label: "AE", name: "United Arab Emirates" },
  { value: "+44", label: "GB", name: "United Kingdom" },
  { value: "+1", label: "US", name: "United States" },
  { value: "+598", label: "UY", name: "Uruguay" },
  { value: "+998", label: "UZ", name: "Uzbekistan" },
  { value: "+678", label: "VU", name: "Vanuatu" },
  { value: "+379", label: "VA", name: "Vatican City" },
  { value: "+58", label: "VE", name: "Venezuela" },
  { value: "+84", label: "VN", name: "Vietnam" },
  { value: "+967", label: "YE", name: "Yemen" },
  { value: "+260", label: "ZM", name: "Zambia" },
  { value: "+263", label: "ZW", name: "Zimbabwe" },
];

interface CountryCodePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function CountryCodePicker({ value, onChange, className }: CountryCodePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = COUNTRY_CODES.find((cc) => cc.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-[120px] shrink-0 justify-between font-normal", className)}
        >
          {selected ? `${selected.label} ${selected.value}` : value}
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search country..." />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {COUNTRY_CODES.map((cc) => (
                <CommandItem
                  key={cc.value}
                  value={`${cc.name} ${cc.label} ${cc.value}`}
                  onSelect={() => {
                    onChange(cc.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === cc.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {cc.label} {cc.value}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {cc.name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
